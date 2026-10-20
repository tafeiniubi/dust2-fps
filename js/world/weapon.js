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
let gunKick = 0;
let muzzleTimer = 0;

/** 开火瞬间：后坐 + 枪口闪光 */
export function kickWeapon() {
  gunKick = 1;
  muzzleTimer = 0.05;
  if (muzzleLight) muzzleLight.intensity = 7;
}

/** 新一局开始时归零 */
export function resetWeapon() {
  gunKick = 0;
  muzzleTimer = 0;
}

function buildWeapon() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e343c });
  const mid = new THREE.MeshLambertMaterial({ color: 0x474e57 });
  const grip = new THREE.MeshLambertMaterial({ color: 0x1f2226 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x5d4a2e });

  const box = (w, h, d, mat, x, y, z, rx) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    m.castShadow = false;
    g.add(m);
    return m;
  };

  box(0.07, 0.1, 0.46, dark, 0, 0, 0);                 // 机匣
  box(0.046, 0.046, 0.3, mid, 0, 0.02, -0.36);         // 护木
  box(0.026, 0.026, 0.2, grip, 0, 0.02, -0.6);         // 枪管
  box(0.012, 0.05, 0.012, mid, 0, 0.055, -0.66);       // 准星
  box(0.03, 0.035, 0.16, mid, 0, 0.075, -0.12);        // 导轨
  box(0.06, 0.15, 0.1, grip, 0, -0.12, 0.04, 0.2);     // 握把
  box(0.05, 0.13, 0.08, dark, 0, -0.13, -0.16, -0.3);  // 弹匣
  box(0.065, 0.1, 0.15, dark, 0, 0.0, 0.3);            // 枪托
  box(0.05, 0.03, 0.08, accent, 0, 0.045, 0.35);       // 托底

  const flashTex = makeCanvasTexture(64, (ctx, s) => {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,235,1)');
    grd.addColorStop(0.3, 'rgba(255,196,96,0.95)');
    grd.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  });

  muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.36),
    new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    })
  );
  muzzleFlash.position.set(0, 0.02, -0.73);
  muzzleFlash.visible = false;
  g.add(muzzleFlash);

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
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
}
