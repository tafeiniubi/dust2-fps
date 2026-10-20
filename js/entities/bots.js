/* =========================================================================
   敌方 AI
   分层状态机：
     patrol  巡逻：沿预设路线往返，发现玩家进入 alert
     alert   警戒：立即转向玩家并短暂停顿，随后转入 attack / chase
     attack  攻击：射程内且视线通畅时自动射击
     chase   追击：追向玩家最后出现的位置，丢失目标后回到 patrol
     dead    死亡：倒地动画，7 秒后从场景移除，击杀计入统计
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

export let bots = [];
let botHitMeshes = [];

/** 当前所有可被命中的敌人网格（供射线检测拼接） */
export function getBotHitMeshes() {
  return botHitMeshes;
}

const losRay = new THREE.Raycaster();

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
    const skin = new THREE.MeshLambertMaterial({ color: 0xb98a63 });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x5c4b36 });
    const vest = new THREE.MeshLambertMaterial({ color: 0x474a3a });
    const gear = new THREE.MeshLambertMaterial({ color: 0x24241f });

    const part = (w, h, d, mat, x, y, z, kind) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.part = kind;
      m.userData.bot = this;
      g.add(m);
      this.hitMeshes.push(m);
      return m;
    };

    part(0.72, 0.8, 0.42, vest, 0, 1.26, 0, 'body');     // 躯干
    part(0.36, 0.36, 0.36, skin, 0, 1.86, 0, 'head');    // 头
    part(0.44, 0.15, 0.46, gear, 0, 2.06, 0, 'head');    // 头盔
    part(0.72, 0.26, 0.44, gear, 0, 1.0, 0, 'body');     // 腰带

    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.19 * side, 0.86, 0);
      g.add(pivot);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.86, 0.3), cloth);
      m.position.y = -0.43;
      m.castShadow = true;
      m.userData.part = 'body';
      m.userData.bot = this;
      pivot.add(m);
      this.hitMeshes.push(m);
      this.legs.push(pivot);
    }

    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.47 * side, 1.52, 0.02);
      pivot.rotation.x = -1.05;
      pivot.rotation.z = 0.18 * side;
      g.add(pivot);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), cloth);
      m.position.y = -0.3;
      m.castShadow = true;
      m.userData.part = 'body';
      m.userData.bot = this;
      pivot.add(m);
      this.hitMeshes.push(m);
    }

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.6), gear);
    gun.position.set(0.16, 1.4, 0.42);
    gun.castShadow = true;
    gun.userData.part = 'body';
    gun.userData.bot = this;
    g.add(gun);
    this.hitMeshes.push(gun);

    /* 头顶血条 */
    this.hbCanvas = document.createElement('canvas');
    this.hbCanvas.width = 96;
    this.hbCanvas.height = 12;
    this.hbCtx = this.hbCanvas.getContext('2d');
    this.hbTex = new THREE.CanvasTexture(this.hbCanvas);
    this.hbTex.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hbTex, transparent: true, depthTest: true }));
    bar.scale.set(1.0, 0.125, 1);
    bar.position.y = 2.4;
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
    ctx.fillStyle = 'rgba(8,8,8,0.78)';
    ctx.fillRect(0, 0, w, h);
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = ratio > 0.55 ? '#7ed957' : ratio > 0.25 ? '#f2c14e' : '#e05a3a';
    ctx.fillRect(1.5, 1.5, (w - 3) * ratio, h - 3);
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

    const from = new THREE.Vector3(p.x, 1.62, p.z);
    const to = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
    const dir = to.clone().sub(from);
    const d = dir.length();
    if (d < 0.3) return true;
    dir.divideScalar(d);
    losRay.set(from, dir);
    losRay.far = d - 0.3;
    return losRay.intersectObjects(worldMeshes, false).length === 0;
  }

  _tryShoot(dt, dist) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    const f = this.diff.fire;
    this.fireTimer = f[0] + Math.random() * (f[1] - f[0]);

    const from = new THREE.Vector3(this.group.position.x, 1.45, this.group.position.z);
    const to = camera.position.clone();
    to.x += (Math.random() - 0.5) * 0.5;
    to.y += (Math.random() - 0.5) * 0.4;
    to.z += (Math.random() - 0.5) * 0.5;
    spawnTracer(from, to, 0xffc46a, 0.06);
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
    botHitMeshes = botHitMeshes.filter((m) => !this.hitMeshes.includes(m));
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
}

export function clearBots() {
  for (const b of bots) scene.remove(b.group);
  bots = [];
  botHitMeshes = [];
}
