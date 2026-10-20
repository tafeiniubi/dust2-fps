/* =========================================================================
   第一人称枪械
   模型在独立场景中渲染，开火时只有它自己后坐，不会暴露玩家位置。
   对外只暴露 kickWeapon / resetWeapon / updateGunVisual。
   ========================================================================= */

import { THREE } from '../core/three.js';
import { gunScene, camera } from './scene.js';
import { makeCanvasTexture } from './textures.js';
import { player, input } from '../core/state.js';

export let muzzleLight = null;

let weaponGroup = null;
let muzzleFlash = null;
let muzzleSmoke = null;
let gunKick = 0;
let muzzleTimer = 0;
let smokeTimer = 0;

/** 开火瞬间：后坐 + 枪口闪光 */
export function kickWeapon() {
  gunKick = 1;
  muzzleTimer = 0.05;
  smokeTimer = 0.55;
  if (muzzleLight) muzzleLight.intensity = 7;
}

/** 新一局开始时归零 */
export function resetWeapon() {
  gunKick = 0;
  muzzleTimer = 0;
  smokeTimer = 0;
  if (muzzleSmoke) muzzleSmoke.visible = false;
}

function buildWeapon() {
  const g = new THREE.Group();
  /* 沙漠战术配色：沙色机匣 + 深色金属件，避免整枪死黑 */
  const body = new THREE.MeshLambertMaterial({ color: 0x8a7a5c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x33383f });
  const mid = new THREE.MeshLambertMaterial({ color: 0x50565f });
  const grip = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x6b5a3c });
  const glove = new THREE.MeshLambertMaterial({ color: 0x4a4436 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a63 });

  const box = (w, h, d, mat, x, y, z, rx, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    m.castShadow = false;
    g.add(m);
    return m;
  };

  /* 上机匣 + 下机匣，做出枪身的高低差 */
  box(0.062, 0.062, 0.44, body, 0, 0.028, -0.02);
  box(0.056, 0.05, 0.4, dark, 0, -0.014, -0.01);
  /* 导轨与护木 */
  box(0.028, 0.026, 0.3, mid, 0, 0.072, -0.02);
  box(0.05, 0.05, 0.26, accent, 0, 0.012, -0.32);
  /* 枪管 + 导流器 + 消焰器 */
  box(0.022, 0.022, 0.22, mid, 0, 0.014, -0.55);
  box(0.03, 0.03, 0.09, dark, 0, 0.014, -0.68);
  box(0.038, 0.038, 0.05, dark, 0, 0.014, -0.74);
  /* 准星与照门 */
  box(0.01, 0.05, 0.01, mid, 0, 0.098, -0.66);
  box(0.03, 0.022, 0.012, mid, 0, 0.078, 0.1);
  /* 握把、弹匣、扳机护圈 */
  box(0.048, 0.14, 0.085, grip, 0, -0.11, 0.05, 0.22);
  box(0.042, 0.13, 0.07, dark, 0, -0.115, -0.14, -0.26);
  box(0.03, 0.012, 0.07, mid, 0, -0.07, 0.0);
  /* 伸缩枪托 */
  box(0.05, 0.07, 0.2, dark, 0, 0.012, 0.24);
  box(0.058, 0.088, 0.05, accent, 0, 0.006, 0.35);
  box(0.03, 0.03, 0.12, mid, 0, 0.05, 0.2);

  /* 手臂与手套：让枪看起来有人握着 */
  const armR = box(0.085, 0.085, 0.3, skin, 0.055, -0.16, 0.19, 0.36);
  box(0.075, 0.075, 0.1, glove, 0.02, -0.1, 0.06, 0.22);
  const armL = box(0.085, 0.085, 0.26, skin, -0.05, -0.14, -0.3, 0.5);
  box(0.07, 0.07, 0.09, glove, -0.03, -0.1, -0.19, 0.3);
  armR.rotation.z = -0.12;
  armL.rotation.z = 0.14;

  const flashTex = makeCanvasTexture(64, (ctx, s) => {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,235,1)');
    grd.addColorStop(0.3, 'rgba(255,196,96,0.95)');
    grd.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  });

  muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    })
  );
  muzzleFlash.position.set(0, 0.014, -0.78);
  muzzleFlash.visible = false;
  g.add(muzzleFlash);

  /* 枪口硝烟：一小团半透明灰烟，消散后淡出 */
  const smokeTex = makeCanvasTexture(64, (ctx, s) => {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(210,200,185,0.55)');
    grd.addColorStop(0.55, 'rgba(190,180,165,0.22)');
    grd.addColorStop(1, 'rgba(180,170,155,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  });
  muzzleSmoke = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.28),
    new THREE.MeshBasicMaterial({
      map: smokeTex, transparent: true, depthWrite: false, opacity: 0,
    })
  );
  muzzleSmoke.position.set(0, 0.02, -0.82);
  muzzleSmoke.visible = false;
  g.add(muzzleSmoke);

  g.scale.setScalar(0.78);
  g.position.set(0.235, -0.215, -0.62);
  g.rotation.set(0.02, 0.1, 0.015);
  gunScene.add(g);
  weaponGroup = g;
}

buildWeapon();

/* 世界中的枪口闪光（照亮环境） */
muzzleLight = new THREE.PointLight(0xffc873, 0, 9, 2);
muzzleLight.position.set(0.18, -0.06, -0.8);
camera.add(muzzleLight);

/** 每帧更新：呼吸摆动、后坐回弹、枪口闪光衰减 */
export function updateGunVisual(dt) {
  if (!weaponGroup) return;
  gunKick = Math.max(0, gunKick - dt * 6.5);
  muzzleTimer = Math.max(0, muzzleTimer - dt);
  input.swayX *= Math.exp(-dt * 6);
  input.swayY *= Math.exp(-dt * 6);

  const bobX = Math.sin(player.bobPhase) * 0.012 * player.moveAmt;
  const bobY = Math.sin(player.bobPhase * 2) * 0.009 * player.moveAmt;
  const crouchDrop = player.crouchAmt * 0.045;
  weaponGroup.position.set(
    0.235 + bobX + input.swayX * 0.016,
    -0.215 + bobY + input.swayY * 0.012 - crouchDrop,
    -0.62 + gunKick * 0.085
  );
  weaponGroup.rotation.set(
    0.02 + gunKick * 0.16,
    0.1 + input.swayX * 0.02,
    0.015 + input.swayY * 0.03
  );

  if (muzzleFlash) {
    muzzleFlash.visible = muzzleTimer > 0;
    if (muzzleTimer > 0) {
      muzzleFlash.rotation.z = Math.random() * Math.PI;
      muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
      muzzleFlash.material.opacity = Math.min(1, muzzleTimer / 0.03);
    }
  }

  /* 硝烟：开火后出现，逐渐变大变淡 */
  if (muzzleSmoke) {
    if (smokeTimer > 0) {
      smokeTimer -= dt;
      muzzleSmoke.visible = true;
      const t = 1 - smokeTimer / 0.55;
      muzzleSmoke.scale.setScalar(0.6 + t * 1.6);
      muzzleSmoke.material.opacity = Math.max(0, 0.5 * (1 - t));
      muzzleSmoke.rotation.z += dt * 1.6;
      muzzleSmoke.position.z = -0.82 - t * 0.12;
    } else {
      muzzleSmoke.visible = false;
    }
  }

  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
}
