/* =========================================================================
   敌方 AI
   分层状态机：
     patrol  巡逻：沿预设路线往返，发现玩家进入 alert
     alert   警戒：立即转向玩家并短暂停顿，随后转入 attack / chase
     attack  攻击：射程内且视线通畅时自动射击
     chase   追击：追向玩家最后出现的位置，丢失目标后回到 patrol
     dead    死亡：倒地动画，7 秒后从场景移除，击杀计入统计

   性能要点：
   - 敌人模型由 9 个 Mesh 合并为 2 个（躯干 / 头），draw call 大幅下降
   - 材质在模块级共享，9 个敌人只用同一批材质
   - 每帧的临时向量全部复用，射线检测零分配
   ========================================================================= */

import { THREE } from '../core/three.js';
import { scene, camera } from '../world/scene.js';
import {
  BOT_PATROL_SPEED, BOT_CHASE_SPEED, BOT_ATTACK_RANGE, BOT_MAX_HP,
} from '../core/config.js';
import { G, player } from '../core/state.js';
import { currentDifficulty } from '../core/prefs.js';
import { groundHeightAt, resolveCollision, worldMeshes } from '../world/map.js';
import { spawnTracer } from '../world/effects.js';
import { playEnemyShot } from '../world/audio.js';
import { damagePlayer } from './player.js';
import { updateHUD, addKillFeed } from '../ui/hud.js';
import { mergeGeometries, applyColor, scaleUv } from '../world/geom.js';

export let bots = [];
let botHitMeshes = [];
let botVersion = 0;

/** 当前所有可被命中的敌人网格（供射线检测拼接） */
export function getBotHitMeshes() {
  return botHitMeshes;
}

/** 敌人可命中网格发生变化时递增，供外部缓存失效 */
export function getBotVersion() {
  return botVersion;
}

const losRay = new THREE.Raycaster();

/* --------------------------------------------------------------- 共享资源
   敌人模型是合并几何体，各部件颜色烘焙在顶点色里，
   所以只用一张白色 + vertexColors 材质。 */
const MAT_BODY = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });

/* 顶点色定义 */
const C_VEST = 0x4c5240;   // 防弹背心
const C_CLOTH = 0x6d5c40;  // 作战服
const C_GEAR = 0x2b2b26;   // 腰带 / 头盔 / 枪
const C_SKIN = 0xb98a63;   // 皮肤

/**
 * 敌人躯干（含腰带、双臂、枪）：把多个盒子合并成一个几何体。
 * 腿需要单独摆动，所以腿部保留为两个小 Mesh（代价极小）。
 */
const BODY_GEO = (() => {
  const parts = [];
  const push = (w, h, d, color, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    applyColor(g, color);
    parts.push(g);
  };
  push(0.66, 0.72, 0.4, C_VEST, 0, 1.32, 0);        // 背心
  push(0.6, 0.3, 0.36, C_CLOTH, 0, 0.94, 0);        // 下身作战服
  push(0.68, 0.24, 0.42, C_GEAR, 0, 1.06, 0);       // 腰带
  push(0.16, 0.6, 0.16, C_CLOTH, 0.44, 1.56, 0.04); // 右臂
  push(0.16, 0.6, 0.16, C_CLOTH, -0.44, 1.56, 0.04);// 左臂
  push(0.14, 0.14, 0.14, C_SKIN, 0.44, 1.9, 0.04);  // 右手
  push(0.14, 0.14, 0.14, C_SKIN, -0.44, 1.9, 0.04); // 左手
  push(0.09, 0.12, 0.56, C_GEAR, 0.18, 1.46, 0.4);  // 枪
  push(0.05, 0.05, 0.2, C_GEAR, 0.18, 1.46, 0.78);  // 枪管
  push(0.14, 0.16, 0.1, C_GEAR, 0.18, 1.2, 0.3);    // 弹匣
  push(0.26, 0.3, 0.1, C_GEAR, 0, 1.4, -0.26);      // 背包
  return mergeGeometries(parts);
})();

const HEAD_GEO = (() => {
  const parts = [];
  const push = (w, h, d, color, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    applyColor(g, color);
    parts.push(g);
  };
  push(0.34, 0.34, 0.34, C_SKIN, 0, 1.86, 0);   // 头
  push(0.42, 0.16, 0.44, C_GEAR, 0, 2.05, 0);   // 头盔
  push(0.4, 0.08, 0.1, C_GEAR, 0, 2.0, 0.22);   // 护目镜
  return mergeGeometries(parts);
})();

const LEG_GEO = (() => {
  const g = new THREE.BoxGeometry(0.24, 0.84, 0.28);
  applyColor(g, C_CLOTH);
  return g;
})();

/* --------------------------------------------------------------- 出生点 */
const BOT_SPAWNS = [
  { name: 'A 区哨兵', x: 22, z: -36, wps: [[22, -36], [34, -34], [18, -30]] },
  { name: 'A 大通道', x: 31, z: 0, wps: [[31, 4], [31, -20]] },
  { name: '中路守卫', x: 2, z: -2, wps: [[2, 4], [2, -18]] },
  { name: 'B 区哨兵', x: -30, z: -34, wps: [[-30, -34], [-40, -40], [-22, -30]] },
  { name: 'B 洞巡逻', x: -31, z: 18, wps: [[-31, 22], [-31, -14]] },
  { name: 'CT 出生点', x: -4, z: -32, wps: [[-4, -30], [4, -36], [-12, -34]] },
  { name: 'A 小增援', x: 18, z: -22, wps: [[18, -22], [12, -26]] },
  { name: '中门增援', x: 6, z: 18, wps: [[6, 18], [6, 6]] },
  { name: 'B 连接增援', x: -24, z: -12, wps: [[-24, -12], [-30, -20]] },
];

/* 不同人数下出场的出生点，保证 3 人时 A / 中路 / B 都有覆盖 */
const SPAWN_ORDER = {
  3: [0, 2, 4],
  6: [0, 1, 2, 3, 4, 5],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

/* --------------------------------------------------------------- 复用向量 */
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();

class Bot {
  constructor(cfg) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.state = 'patrol';
    this.hp = BOT_MAX_HP;
    this.maxHp = BOT_MAX_HP;
    this.alive = true;
    this.yaw = 0;
    this.lastSeen = -999;
    this.lastKnown = new THREE.Vector3(cfg.x, 0, cfg.z);
    this.canSee = false;
    this.losTimer = Math.random() * 0.2;
    this.alertTimer = 0;
    this.alertFlash = 0;
    this.diff = currentDifficulty();
    this.fireTimer = 1 + Math.random() * this.diff.fire[1];
    this.speedNow = 0;
    this.walkPhase = Math.random() * 6;
    this.stuck = 0;
    this.deathTime = 0;
    this.removed = false;
    this.wps = cfg.wps.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    this.wpIndex = 0;
    this.wpDir = 1;

    this.group = new THREE.Group();
    this.group.position.set(cfg.x, groundHeightAt(cfg.x, cfg.z, 0), cfg.z);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.hitMeshes = [];
    this._build();
    scene.add(this.group);
  }

  _build() {
    const g = this.group;

    /* 躯干：合并网格，命中判定按整体算 body */
    const body = new THREE.Mesh(BODY_GEO, MAT_BODY);
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.part = 'body';
    body.userData.bot = this;
    g.add(body);
    this.hitMeshes.push(body);

    /* 头 + 头盔：单独一个网格，爆头判定 */
    const head = new THREE.Mesh(HEAD_GEO, MAT_BODY);
    head.castShadow = true;
    head.receiveShadow = true;
    head.userData.part = 'head';
    head.userData.bot = this;
    g.add(head);
    this.hitMeshes.push(head);

    /* 腿：两个 pivot，负责走路摆动 */
    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.19 * side, 0.86, 0);
      g.add(pivot);
      const m = new THREE.Mesh(LEG_GEO, MAT_BODY);
      m.position.y = -0.43;
      m.castShadow = true;
      m.userData.part = 'body';
      m.userData.bot = this;
      pivot.add(m);
      this.hitMeshes.push(m);
      this.legs.push(pivot);
    }

    /* 头顶血条 */
    this.hbCanvas = document.createElement('canvas');
    this.hbCanvas.width = 96;
    this.hbCanvas.height = 12;
    this.hbCtx = this.hbCanvas.getContext('2d');
    this.hbTex = new THREE.CanvasTexture(this.hbCanvas);
    this.hbTex.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hbTex, transparent: true, depthTest: true }));
    bar.scale.set(0.9, 0.115, 1);
    bar.position.y = 2.32;
    bar.raycast = () => {};
    g.add(bar);
    this.healthSprite = bar;

    /* 警戒感叹号 */
    const ac = document.createElement('canvas');
    ac.width = ac.height = 48;
    const actx = ac.getContext('2d');
    actx.font = 'bold 40px Arial';
    actx.textAlign = 'center';
    actx.textBaseline = 'middle';
    actx.lineWidth = 6;
    actx.strokeStyle = 'rgba(0,0,0,0.85)';
    actx.strokeText('!', 24, 26);
    actx.fillStyle = '#ffd24a';
    actx.fillText('!', 24, 26);
    const atex = new THREE.CanvasTexture(ac);
    atex.colorSpace = THREE.SRGBColorSpace;
    const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: atex, transparent: true, depthTest: false }));
    alert.scale.set(0.42, 0.42, 1);
    alert.position.y = 2.85;
    alert.visible = false;
    alert.raycast = () => {};
    g.add(alert);
    this.alertSprite = alert;

    this._drawHealthBar();
  }

  _drawHealthBar() {
    const ctx = this.hbCtx;
    const w = 96, h = 12;
    ctx.clearRect(0, 0, w, h);
    /* 外框 */
    ctx.fillStyle = 'rgba(10,10,8,0.72)';
    ctx.fillRect(0, 0, w, h);
    const ratio = Math.max(0, this.hp / this.maxHp);
    /* 血条本体 */
    ctx.fillStyle = ratio > 0.55 ? '#8fdc5e' : ratio > 0.25 ? '#f2c14e' : '#e05a3a';
    ctx.fillRect(2, 2, (w - 4) * ratio, h - 4);
    /* 分段刻度：即使被遮挡也能读出大致血量 */
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < 4; i++) ctx.fillRect((w / 4) * i - 1, 2, 2, h - 4);
    /* 描边 */
    ctx.strokeStyle = 'rgba(255,230,180,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    this.hbTex.needsUpdate = true;
  }

  update(dt) {
    if (!this.alive) { this._deathUpdate(dt); return; }

    this.speedNow = 0;
    const p = this.group.position;
    const pp = player.pos;
    const dx = pp.x - p.x, dz = pp.z - p.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));

    /* 视线检测节流：每 0.12s 左右一次 */
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.12 + Math.random() * 0.1;
      this.canSee = this._checkSight(pp, dist);
    }
    if (this.canSee) {
      this.lastSeen = G.time;
      this.lastKnown.set(pp.x, 0, pp.z);
    }
    const lost = G.time - this.lastSeen;

    switch (this.state) {
      case 'patrol':
        if (this.canSee) {
          this.state = 'alert';
          this.alertTimer = this.diff.alert;
          this.alertFlash = 0.85;
        } else {
          this._patrol(dt);
        }
        break;

      case 'alert':
        this._face(pp, dt, 7);
        this.alertTimer -= dt;
        if (this.alertTimer <= 0) {
          this.state = (this.canSee && dist <= BOT_ATTACK_RANGE) ? 'attack' : 'chase';
        }
        break;

      case 'attack':
        this._face(pp, dt, 9);
        if (!this.canSee && lost > 1.2) this.state = 'chase';
        else if (dist > BOT_ATTACK_RANGE + 5) this.state = 'chase';
        else if (this.canSee) this._tryShoot(dt, dist);
        break;

      case 'chase':
        this._face(pp, dt, 5);
        if (this.canSee && dist <= BOT_ATTACK_RANGE) {
          this.state = 'attack';
        } else if (lost > 6 || (!this.canSee && dist < 1.9)) {
          this.state = 'patrol';
        } else {
          this._moveTo(this.lastKnown, dt, BOT_CHASE_SPEED * this.diff.speed);
        }
        break;
    }

    this.alertFlash = Math.max(0, this.alertFlash - dt);
    this.alertSprite.visible = this.alertFlash > 0;
    this.group.position.y = groundHeightAt(p.x, p.z, p.y);
    this._animate(dt);
  }

  _patrol(dt) {
    const wp = this.wps[this.wpIndex];
    const p = this.group.position;
    if (Math.hypot(wp.x - p.x, wp.z - p.z) < 1.1) {
      this.wpIndex += this.wpDir;
      if (this.wpIndex >= this.wps.length - 1) { this.wpIndex = this.wps.length - 1; this.wpDir = -1; }
      else if (this.wpIndex <= 0) { this.wpIndex = 0; this.wpDir = 1; }
    } else {
      this._moveTo(wp, dt, BOT_PATROL_SPEED * this.diff.speed);
    }
  }

  _moveTo(target, dt, speed) {
    const p = this.group.position;
    let dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    dx /= d; dz /= d;
    const step = speed * dt;
    const ox = p.x, oz = p.z;
    p.x += dx * step;
    p.z += dz * step;
    resolveCollision(p, 0.38, p.y, 1.9);
    if (groundHeightAt(p.x, p.z, p.y) > p.y + 0.62) { p.x = ox; p.z = oz; }
    this._setYaw(Math.atan2(dx, dz), dt, 8);
    this.speedNow = speed;

    /* 卡住检测：在拐角被挡住时换一个巡逻点 */
    if (Math.hypot(p.x - ox, p.z - oz) < step * 0.35) {
      this.stuck += dt;
      if (this.stuck > 0.7) {
        this.stuck = 0;
        if (this.state === 'patrol') {
          this.wpIndex = (this.wpIndex + 1) % this.wps.length;
        } else {
          this.state = 'patrol';
        }
      }
    } else {
      this.stuck = 0;
    }
  }

  _setYaw(targetYaw, dt, rate) {
    let diff = targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, rate * dt);
    this.group.rotation.y = this.yaw;
  }

  _face(target, dt, rate) {
    const p = this.group.position;
    this._setYaw(Math.atan2(target.x - p.x, target.z - p.z), dt, rate);
  }

  /** 距离 + 视野角 + 射线遮挡三重判定 */
  _checkSight(pp, dist) {
    if (dist > this.diff.sight) return false;
    const p = this.group.position;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const nx = (pp.x - p.x) / dist, nz = (pp.z - p.z) / dist;
    if (fx * nx + fz * nz < 0.1 && dist > 5) return false;

    _from.set(p.x, 1.62, p.z);
    _to.set(camera.position.x, camera.position.y, camera.position.z);
    _dir.copy(_to).sub(_from);
    const d = _dir.length();
    if (d < 0.3) return true;
    _dir.divideScalar(d);
    losRay.set(_from, _dir);
    losRay.far = d - 0.3;
    return losRay.intersectObjects(worldMeshes, false).length === 0;
  }

  _tryShoot(dt, dist) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    const f = this.diff.fire;
    this.fireTimer = f[0] + Math.random() * (f[1] - f[0]);

    _from.set(this.group.position.x, 1.45, this.group.position.z);
    _to.set(
      camera.position.x + (Math.random() - 0.5) * 0.5,
      camera.position.y + (Math.random() - 0.5) * 0.4,
      camera.position.z + (Math.random() - 0.5) * 0.5
    );
    spawnTracer(_from, _to, 0xffc46a, 0.06);
    playEnemyShot();

    const chance = THREE.MathUtils.clamp(this.diff.accuracy - dist * this.diff.falloff, 0.12, 0.92);
    if (Math.random() < chance) damagePlayer((6 + Math.random() * 7) * this.diff.damageMul);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this._drawHealthBar();
    this.lastSeen = G.time;
    this.lastKnown.copy(player.pos);
    if (this.hp <= 0) {
      this.die();
    } else {
      this.state = 'alert';
      this.alertTimer = 0.18;
      this.alertFlash = 0.55;
    }
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.state = 'dead';
    this.deathTime = 0;
    this.healthSprite.visible = false;
    this.alertSprite.visible = false;
    this.hitMeshes.forEach((m) => { m.userData.bot = null; });
    /* 就地移除，保持数组引用稳定（射击目标列表会被缓存复用） */
    for (const m of this.hitMeshes) {
      const i = botHitMeshes.indexOf(m);
      if (i >= 0) botHitMeshes.splice(i, 1);
    }
    botVersion++;
    G.kills++;
    addKillFeed(this.name);
    updateHUD();
  }

  _deathUpdate(dt) {
    this.deathTime += dt;
    const t = Math.min(1, this.deathTime * 2.4);
    const s = t * t * (3 - 2 * t);
    this.group.rotation.x = -Math.PI / 2 * s;
    this.group.position.y = groundHeightAt(this.group.position.x, this.group.position.z, 0)
      + Math.min(0.22, this.deathTime * 0.25);
    if (this.deathTime > 7 && !this.removed) {
      this.removed = true;
      scene.remove(this.group);
    }
  }

  _animate(dt) {
    this.walkPhase += dt * (2 + this.speedNow * 2.2);
    const swing = Math.min(1, this.speedNow / 3) * 0.55;
    this.legs[0].rotation.x = Math.sin(this.walkPhase) * swing;
    this.legs[1].rotation.x = -Math.sin(this.walkPhase) * swing;
  }
}

export function spawnBots(count = 6) {
  const order = SPAWN_ORDER[count] || SPAWN_ORDER[6];
  bots = order.map((idx, i) => new Bot({ ...BOT_SPAWNS[idx], id: i }));
  botHitMeshes = bots.flatMap((b) => b.hitMeshes);
  botVersion++;
}

export function clearBots() {
  for (const b of bots) scene.remove(b.group);
  bots = [];
  botHitMeshes = [];
  botVersion++;
}
