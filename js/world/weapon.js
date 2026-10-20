/* =========================================================================
   第一人称枪械
   模型在独立场景中渲染，开火时只有它自己后坐，不会暴露玩家位置。
   对外暴露：setWeaponModel / kickWeapon / resetWeapon / updateGunVisual。

   三把武器各自是一组模型：
     M4A1   —— 5.56 战术步枪，沙色机匣
     AK-47  —— 7.62 木纹突击步枪，后坐更大
     小刀   —— 近战，持有姿态与枪械不同，挥砍有动画
   ========================================================================= */

import { THREE } from '../core/three.js';
import { gunScene, camera } from './scene.js';
import { makeCanvasTexture } from './textures.js';
import { player, input } from '../core/state.js';

export let muzzleLight = null;

/* 当前显示的武器 id */
let currentId = 'm4a1';

/* 各武器模型根节点 */
const models = {};

/* 枪口焰 / 硝烟（每把枪各一份） */
const fx = {};

/* 动画状态 */
let gunKick = 0;
let muzzleTimer = 0;
let smokeTimer = 0;
let switchTimer = 0;     // 切枪动画进度
let switchFrom = null;   // 正在收起的旧武器
let switchTo = null;     // 正在展开的新武器
let swingTimer = 0;      // 挥刀动画
let swingActive = false;

/** 开火瞬间：后坐 + 枪口闪光 */
export function kickWeapon() {
  gunKick = 1;
  muzzleTimer = 0.05;
  smokeTimer = 0.55;
  if (muzzleLight) muzzleLight.intensity = 7;
}

/** 小刀挥砍：触发一次挥砍动画 */
export function swingKnife() {
  swingActive = true;
  swingTimer = 0.34;
}

/** 新一局开始时归零 */
export function resetWeapon() {
  gunKick = 0;
  muzzleTimer = 0;
  smokeTimer = 0;
  switchTimer = 0;
  switchFrom = null;
  switchTo = null;
  swingTimer = 0;
  swingActive = false;
  currentId = 'm4a1';
  for (const id in models) models[id].visible = (id === 'm4a1');
  for (const id in fx) {
    if (fx[id].flash) fx[id].flash.visible = false;
    if (fx[id].smoke) { fx[id].smoke.visible = false; fx[id].smoke.position.z = fx[id].smokeBaseZ; }
  }
}

/** 切换武器模型（带一小段下沉/上抬动画） */
export function setWeaponModel(id) {
  if (!models[id] || id === currentId) return;
  switchFrom = currentId;
  currentId = id;
  switchTo = id;
  switchTimer = 0.28;
  /* 切枪瞬间清掉旧的枪口特效 */
  for (const key in fx) {
    const f = fx[key];
    if (f.flash) f.flash.visible = false;
    if (f.smoke) { f.smoke.visible = false; f.smoke.position.z = f.smokeBaseZ; }
  }
  muzzleTimer = 0;
  smokeTimer = 0;
  gunKick = 0;
}

export function getWeaponModelId() {
  return currentId;
}

/* --------------------------------------------------------------- 共享素材 */
function makeFlashTexture() {
  return makeCanvasTexture(64, (ctx, s) => {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,235,1)');
    grd.addColorStop(0.3, 'rgba(255,196,96,0.95)');
    grd.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  });
}

function makeSmokeTexture() {
  return makeCanvasTexture(64, (ctx, s) => {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(210,200,185,0.55)');
    grd.addColorStop(0.55, 'rgba(190,180,165,0.22)');
    grd.addColorStop(1, 'rgba(180,170,155,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  });
}

let flashTex = null;
let smokeTex = null;

/**
 * 通用建模工具：在一组零件上生成带位置/旋转的盒子。
 * 返回零件数组，方便后面合并成少量 Mesh。
 */
function part(parts, w, h, d, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (ry) m.rotation.y = ry;
  if (rz) m.rotation.z = rz;
  m.castShadow = false;
  parts.push(m);
  return m;
}

/* --------------------------------------------------------------- M4A1 */
function buildM4A1() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x8a7a5c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x33383f });
  const mid = new THREE.MeshLambertMaterial({ color: 0x50565f });
  const grip = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x6b5a3c });
  const glove = new THREE.MeshLambertMaterial({ color: 0x4a4436 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a63 });

  const P = [];
  /* 上机匣 + 下机匣，做出枪身的高低差 */
  part(P, 0.062, 0.062, 0.44, body, 0, 0.028, -0.02);
  part(P, 0.056, 0.05, 0.4, dark, 0, -0.014, -0.01);
  /* 导轨与护木 */
  part(P, 0.028, 0.026, 0.3, mid, 0, 0.072, -0.02);
  part(P, 0.05, 0.05, 0.26, accent, 0, 0.012, -0.32);
  /* 枪管 + 导流器 + 消焰器 */
  part(P, 0.022, 0.022, 0.22, mid, 0, 0.014, -0.55);
  part(P, 0.03, 0.03, 0.09, dark, 0, 0.014, -0.68);
  part(P, 0.038, 0.038, 0.05, dark, 0, 0.014, -0.74);
  /* 准星与照门 */
  part(P, 0.01, 0.05, 0.01, mid, 0, 0.098, -0.66);
  part(P, 0.03, 0.022, 0.012, mid, 0, 0.078, 0.1);
  /* 握把、弹匣、扳机护圈 */
  part(P, 0.048, 0.14, 0.085, grip, 0, -0.11, 0.05, 0.22);
  part(P, 0.042, 0.13, 0.07, dark, 0, -0.115, -0.14, -0.26);
  part(P, 0.03, 0.012, 0.07, mid, 0, -0.07, 0.0);
  /* 伸缩枪托 */
  part(P, 0.05, 0.07, 0.2, dark, 0, 0.012, 0.24);
  part(P, 0.058, 0.088, 0.05, accent, 0, 0.006, 0.35);
  part(P, 0.03, 0.03, 0.12, mid, 0, 0.05, 0.2);

  /* 手臂与手套：让枪看起来有人握着 */
  const armR = part(P, 0.085, 0.085, 0.3, skin, 0.055, -0.16, 0.19, 0.36);
  part(P, 0.075, 0.075, 0.1, glove, 0.02, -0.1, 0.06, 0.22);
  const armL = part(P, 0.085, 0.085, 0.26, skin, -0.05, -0.14, -0.3, 0.5);
  part(P, 0.07, 0.07, 0.09, glove, -0.03, -0.1, -0.19, 0.3);
  armR.rotation.z = -0.12;
  armL.rotation.z = 0.14;

  for (const m of P) g.add(m);

  g.scale.setScalar(0.78);
  g.position.set(0.235, -0.215, -0.62);
  g.rotation.set(0.02, 0.1, 0.015);
  gunScene.add(g);
  models.m4a1 = g;

  /* 枪口焰与硝烟挂在消焰器位置 */
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    })
  );
  flash.position.set(0, 0.014, -0.78);
  flash.visible = false;
  g.add(flash);

  const smoke = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.28),
    new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })
  );
  smoke.position.set(0, 0.02, -0.82);
  smoke.visible = false;
  g.add(smoke);

  fx.m4a1 = { flash, smoke, smokeBaseZ: smoke.position.z };
}

/* --------------------------------------------------------------- AK-47 */
function buildAK47() {
  const g = new THREE.Group();
  /* 经典 AK 配色：木纹护木 + 黑色机匣 + 深色金属 */
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a4a24 });
  const woodLight = new THREE.MeshLambertMaterial({ color: 0x96602f });
  const black = new THREE.MeshLambertMaterial({ color: 0x2b2724 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x484c52 });
  const mag = new THREE.MeshLambertMaterial({ color: 0x4a3a2c });
  const glove = new THREE.MeshLambertMaterial({ color: 0x4a4436 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a63 });

  const P = [];
  /* 接收机 */
  part(P, 0.058, 0.072, 0.36, black, 0, 0.03, -0.02);
  /* 顶盖 */
  part(P, 0.05, 0.022, 0.3, steel, 0, 0.076, -0.02);
  /* 前后木质护木（下机匣木纹） */
  part(P, 0.052, 0.05, 0.16, wood, 0, 0.008, -0.24);
  part(P, 0.05, 0.048, 0.22, woodLight, 0, 0.004, -0.44);
  /* 弹匣：AK 标志性的弧形，用两块斜叠出弧度 */
  part(P, 0.04, 0.11, 0.062, mag, 0, -0.075, -0.1, -0.22);
  part(P, 0.038, 0.1, 0.058, mag, 0, -0.175, -0.135, -0.4);
  /* 枪管 + 导流器 + 消焰器 */
  part(P, 0.021, 0.021, 0.2, steel, 0, 0.012, -0.63);
  part(P, 0.032, 0.032, 0.07, steel, 0, 0.012, -0.75);
  part(P, 0.036, 0.036, 0.05, black, 0, 0.012, -0.81);
  /* 准星 / 照门 */
  part(P, 0.012, 0.05, 0.012, black, 0, 0.098, -0.72);
  part(P, 0.028, 0.024, 0.014, black, 0, 0.084, 0.06);
  /* 握把 + 扳机护圈 */
  part(P, 0.046, 0.135, 0.08, black, 0, -0.105, 0.08, 0.24);
  part(P, 0.03, 0.012, 0.07, steel, 0, -0.065, 0.02);
  /* 木质枪托（AK 的经典弧形，用两段拼出） */
  part(P, 0.05, 0.055, 0.16, wood, 0, 0.0, 0.24);
  part(P, 0.052, 0.09, 0.09, wood, 0, -0.028, 0.31, -0.2);
  part(P, 0.056, 0.1, 0.03, black, 0, -0.04, 0.35);

  /* 手臂 */
  const armR = part(P, 0.085, 0.085, 0.3, skin, 0.055, -0.16, 0.2, 0.36);
  part(P, 0.075, 0.075, 0.1, glove, 0.02, -0.1, 0.07, 0.22);
  const armL = part(P, 0.085, 0.085, 0.28, skin, -0.05, -0.14, -0.28, 0.52);
  part(P, 0.07, 0.07, 0.09, glove, -0.03, -0.1, -0.17, 0.3);
  armR.rotation.z = -0.12;
  armL.rotation.z = 0.14;

  for (const m of P) g.add(m);

  g.scale.setScalar(0.78);
  g.position.set(0.235, -0.215, -0.62);
  g.rotation.set(0.02, 0.1, 0.015);
  gunScene.add(g);
  models.ak47 = g;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    })
  );
  flash.position.set(0, 0.012, -0.86);
  flash.visible = false;
  g.add(flash);

  const smoke = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })
  );
  smoke.position.set(0, 0.018, -0.9);
  smoke.visible = false;
  g.add(smoke);

  fx.ak47 = { flash, smoke, smokeBaseZ: smoke.position.z };
}

/* --------------------------------------------------------------- 小刀 */
function buildKnife() {
  const g = new THREE.Group();
  const blade = new THREE.MeshLambertMaterial({ color: 0xc9ced6 });
  const bladeDark = new THREE.MeshLambertMaterial({ color: 0x8f959e });
  const handle = new THREE.MeshLambertMaterial({ color: 0x2f2a26 });
  const glove = new THREE.MeshLambertMaterial({ color: 0x4a4436 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a63 });

  const P = [];
  /* 刀身：两段做出刀尖的斜面 */
  part(P, 0.012, 0.038, 0.30, blade, 0, 0, -0.15);
  part(P, 0.01, 0.03, 0.12, blade, 0, 0.008, -0.34, 0.22);
  /* 血槽 */
  part(P, 0.014, 0.008, 0.2, bladeDark, 0, 0.004, -0.17);
  /* 护手 */
  part(P, 0.05, 0.018, 0.026, bladeDark, 0, 0, 0.012);
  /* 刀柄 */
  part(P, 0.024, 0.03, 0.13, handle, 0, 0, 0.09);
  part(P, 0.028, 0.034, 0.022, bladeDark, 0, 0, 0.16);
  /* 右手握住刀柄 */
  const armR = part(P, 0.085, 0.085, 0.28, skin, 0.04, -0.09, 0.22, 0.4);
  part(P, 0.072, 0.072, 0.1, glove, 0.01, -0.03, 0.13, 0.3);
  armR.rotation.z = -0.1;

  for (const m of P) g.add(m);

  /* 刀在右下方、刀尖朝前 */
  g.scale.setScalar(0.95);
  g.position.set(0.3, -0.3, -0.5);
  g.rotation.set(0.1, 0.22, -0.34);
  gunScene.add(g);
  models.knife = g;

  fx.knife = { flash: null, smoke: null, smokeBaseZ: 0 };
}

/* --------------------------------------------------------------- 初始化 */
flashTex = makeFlashTexture();
smokeTex = makeSmokeTexture();
buildM4A1();
buildAK47();
buildKnife();
models.ak47.visible = false;
models.knife.visible = false;

/* 世界中的枪口闪光（照亮环境） */
muzzleLight = new THREE.PointLight(0xffc873, 0, 9, 2);
muzzleLight.position.set(0.18, -0.06, -0.8);
camera.add(muzzleLight);

/* 每把武器的持枪姿态（位置/旋转基准） */
const POSE = {
  m4a1: { pos: [0.235, -0.215, -0.62], rot: [0.02, 0.1, 0.015] },
  ak47: { pos: [0.235, -0.215, -0.62], rot: [0.02, 0.1, 0.015] },
  knife: { pos: [0.3, -0.3, -0.5], rot: [0.1, 0.22, -0.34] },
};

/* --------------------------------------------------------------- 每帧更新 */
export function updateGunVisual(dt) {
  gunKick = Math.max(0, gunKick - dt * 6.5);
  muzzleTimer = Math.max(0, muzzleTimer - dt);
  input.swayX *= Math.exp(-dt * 6);
  input.swayY *= Math.exp(-dt * 6);

  const bobX = Math.sin(player.bobPhase) * 0.012 * player.moveAmt;
  const bobY = Math.sin(player.bobPhase * 2) * 0.009 * player.moveAmt;
  const crouchDrop = player.crouchAmt * 0.045;

  /* 切枪动画：旧枪下沉收起，新枪抬起 */
  let switchT = 1;
  if (switchTimer > 0) {
    switchTimer = Math.max(0, switchTimer - dt);
    switchT = 1 - switchTimer / 0.28;   // 0 → 1
    if (switchTimer <= 0) switchFrom = null;
  }

  for (const id in models) {
    const g = models[id];
    const active = id === currentId;
    const leaving = id === switchFrom;
    /* 切枪过渡中：新旧两把枪短暂共存 */
    const visible = active || (switchTimer > 0 && (id === switchTo || leaving));
    g.visible = visible;
    if (!visible) continue;

    const pose = POSE[id];
    const isKnife = id === 'knife';

    /* 旧枪下沉，新枪从下方抬起 */
    let dip = 0;
    if (leaving) dip = -switchT * 0.5;
    else if (switchTimer > 0 && id === switchTo) dip = -(1 - switchT) * 0.5;

    /* 小刀挥砍：向右前方划出一道弧 */
    let swingX = 0, swingY = 0, swingZ = 0;
    if (isKnife && swingActive) {
      const t = Math.min(1, 1 - swingTimer / 0.34);
      const s = Math.sin(t * Math.PI);
      swingY = -s * 0.34;
      swingZ = s * 0.2;
      swingX = s * 0.42;
    }

    /* 行走摆动：小刀幅度小一些 */
    const bobAmp = isKnife ? 0.5 : 1;
    g.position.set(
      pose.pos[0] + (bobX + input.swayX * 0.016) * bobAmp + swingX,
      pose.pos[1] + (bobY + input.swayY * 0.012) * bobAmp - crouchDrop + dip + swingY,
      pose.pos[2] + gunKick * 0.085 + swingZ
    );
    g.rotation.set(
      pose.rot[0] + gunKick * 0.16,
      pose.rot[1] + input.swayX * 0.02 - swingX * 0.5,
      pose.rot[2] + input.swayY * 0.03 + swingX * 0.6
    );
  }

  /* 枪口焰与硝烟只跟随当前武器 */
  const f = fx[currentId];
  if (f && f.flash) {
    f.flash.visible = muzzleTimer > 0;
    if (muzzleTimer > 0) {
      f.flash.rotation.z = Math.random() * Math.PI;
      f.flash.scale.setScalar(0.8 + Math.random() * 0.5);
      f.flash.material.opacity = Math.min(1, muzzleTimer / 0.03);
    }
  }
  if (f && f.smoke) {
    if (smokeTimer > 0) {
      smokeTimer -= dt;
      f.smoke.visible = true;
      const t = 1 - smokeTimer / 0.55;
      f.smoke.scale.setScalar(0.6 + t * 1.6);
      f.smoke.material.opacity = Math.max(0, 0.5 * (1 - t));
      f.smoke.rotation.z += dt * 1.6;
      f.smoke.position.z = f.smokeBaseZ - t * 0.12;
    } else {
      f.smoke.visible = false;
    }
  }

  if (swingActive) {
    swingTimer = Math.max(0, swingTimer - dt);
    if (swingTimer <= 0) swingActive = false;
  }

  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
}
