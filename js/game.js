/* =========================================================================
   游戏主流程
   负责：射击与换弹、玩家死亡与胜负判定、主循环、开始/暂停/结算、
   以及把输入层的事件接到具体动作上。
   ========================================================================= */

import { THREE } from './core/three.js';
import { MAX_AMMO, RELOAD_TIME, FIRE_INTERVAL } from './core/config.js';
import { G, player, keys, input, hooks } from './core/state.js';
import { camera, scene, renderer, gunScene, gunCamera } from './world/scene.js';
import { worldMeshes, groundHeightAt, resolveCollision, colliders } from './world/map.js';
import {
  spawnTracer, spawnImpact, spawnBlood, addBulletHole, updateEffects,
} from './world/effects.js';
import { initAudio, playGunshot, playReload } from './world/audio.js';
import { kickWeapon, resetWeapon, updateGunVisual } from './world/weapon.js';
import { look, updatePlayer, syncCamera, updateRecoil, damagePlayer } from './entities/player.js';
import { bots, spawnBots, clearBots, getBotHitMeshes } from './entities/bots.js';
import { updateHUD, drawMinimap, resetHUD, bindBotSource, showHitmarker } from './ui/hud.js';
import { showGameUI, showPauseUI, hidePauseUI, showEndUI, showMenuUI } from './ui/screens.js';
import { dom } from './ui/dom.js';
import { bindInput, releasePointerLock } from './core/input.js';
import { bindings, loadBindings } from './core/bindings.js';
import { initKeySettings, hideKeySettings, isKeySettingsOpen } from './ui/settings.js';

/* HUD 需要敌人列表，这里注入，避免 ui → entities 的循环依赖 */
bindBotSource(() => bots);

/* 先恢复玩家上次保存的键位，再让输入层和设置面板开始工作 */
loadBindings();

/* --------------------------------------------------------------- 射击 */
const shootRay = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const muzzleWorld = new THREE.Vector3();

function getMuzzleWorld() {
  return muzzleWorld
    .set(0.24, -0.16, -0.95)
    .applyQuaternion(camera.quaternion)
    .add(camera.position);
}

export function playerShoot() {
  if (G.state !== 'playing' || G.reloading) return;
  if (G.time < G.nextShot) return;
  if (G.ammo <= 0) { startReload(); return; }

  G.ammo--;
  G.nextShot = G.time + FIRE_INTERVAL;
  G.shotsFired++;
  G.recoil = Math.min(0.085, G.recoil + 0.014 * (1 - player.crouchAmt * 0.35));
  G.recoilYaw += (Math.random() - 0.5) * 0.012;
  G.bloom = Math.min(1, G.bloom + 0.32);
  G.shake = Math.min(0.5, G.shake + 0.05);
  kickWeapon();
  playGunshot();

  /* 移动中与连续射击会扩大散布；蹲下则收束散布 */
  const moving = player.moveAmt > 0.25;
  const crouchFactor = 1 - player.crouchAmt * 0.5;
  const spread = (0.004 + (moving ? 0.009 : 0) + G.bloom * 0.01) * crouchFactor;
  camera.getWorldDirection(tmpDir);
  tmpDir.x += (Math.random() - 0.5) * spread;
  tmpDir.y += (Math.random() - 0.5) * spread;
  tmpDir.z += (Math.random() - 0.5) * spread;
  tmpDir.normalize();

  shootRay.set(camera.position, tmpDir);
  shootRay.far = 240;

  const targets = worldMeshes.concat(getBotHitMeshes());
  const hits = shootRay.intersectObjects(targets, false);
  const hit = hits.length ? hits[0] : null;
  const muzzle = getMuzzleWorld().clone();

  if (hit) {
    spawnTracer(muzzle, hit.point, 0xffe0a0, 0.07);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      G.shotsHit++;
      const part = hit.object.userData.part;
      const dmg = part === 'head' ? 120 : part === 'body' ? 36 : 24;
      spawnBlood(hit.point, part === 'head');
      bot.takeDamage(dmg);
      showHitmarker(part === 'head');
    } else {
      const n = hit.face
        ? hit.face.normal.clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
          .normalize()
        : new THREE.Vector3(0, 1, 0);
      spawnImpact(hit.point, n);
      addBulletHole(hit);
    }
  } else {
    const end = camera.position.clone().addScaledVector(tmpDir, 130);
    spawnTracer(muzzle, end, 0xffe0a0, 0.07);
  }

  if (G.ammo <= 0) startReload();
  updateHUD();
}

export function startReload() {
  if (G.state !== 'playing' || G.reloading || G.ammo >= MAX_AMMO) return;
  G.reloading = true;
  G.reloadEnd = G.time + RELOAD_TIME;
  playReload();
}

export function finishReload() {
  G.ammo = MAX_AMMO;
  G.reloading = false;
  updateHUD();
}

/* --------------------------------------------------------------- 伤害与结束 */
function playerDie() {
  if (G.state !== 'playing') return;
  G.state = 'dying';
  releasePointerLock();
  scheduleEnd(false);
}

function scheduleEnd(win) {
  if (G.endAt) return;
  G.endWin = win;
  G.endAt = performance.now() + 950;
}

export function showEnd(win) {
  G.state = 'end';
  G.endAt = 0;
  showEndUI(win);
  releasePointerLock();
}

/* --------------------------------------------------------------- 每帧逻辑 */
let miniTimer = 0;

function updateGame(dt) {
  updatePlayer(dt);
  syncCamera();

  if (input.mouseHeld) playerShoot();
  if (G.reloading && G.time >= G.reloadEnd) finishReload();

  for (const b of bots) b.update(dt);
  updateEffects(dt);
  updateRecoil(dt);

  dom.crosshair.style.setProperty('--gap', (6 + G.bloom * 10 + player.moveAmt * 4).toFixed(1) + 'px');
  updateHUD();

  miniTimer -= dt;
  if (miniTimer <= 0) { miniTimer = 0.08; drawMinimap(); }

  if (!G.endAt && bots.length && bots.every((b) => !b.alive)) scheduleEnd(true);
}

/* --------------------------------------------------------------- 开始 / 暂停 */
export function startGame() {
  initAudio();
  hideKeySettings();
  showGameUI();
  resetHUD();

  G.state = 'playing';
  G.time = 0;
  G.yaw = 0;
  G.pitch = 0;
  G.recoil = 0;
  G.recoilYaw = 0;
  G.bloom = 0;
  G.shake = 0;
  G.kills = 0;
  G.ammo = MAX_AMMO;
  G.reloading = false;
  G.reloadEnd = 0;
  G.nextShot = 0;
  G.shotsFired = 0;
  G.shotsHit = 0;
  G.endAt = 0;
  G.endWin = false;

  player.pos.set(2, 0, 38);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.hp = 100;
  player.onGround = true;
  player.bobPhase = 0;
  player.moveAmt = 0;
  player.crouchAmt = 0;

  input.mouseHeld = false;
  input.dragging = false;
  input.jumpQueued = false;
  for (const k in keys) delete keys[k];
  resetWeapon();

  clearBots();
  spawnBots();
  updateHUD();
  drawMinimap();
  syncCamera();
  camera.rotation.set(0, 0, 0);
}

export function togglePause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  showPauseUI();
  input.mouseHeld = false;
  input.dragging = false;
  releasePointerLock();
}

export function resumeGame() {
  if (G.state !== 'paused') return;
  /* 设置面板打开时，Esc 先回到暂停菜单，而不是直接继续游戏 */
  if (isKeySettingsOpen()) { hideKeySettings(); return; }
  G.state = 'playing';
  hidePauseUI();
  initAudio();
}

/** 退出到主菜单（暂停菜单里的“退出游戏”） */
export function quitToMenu() {
  releasePointerLock();
  hideKeySettings();
  G.state = 'menu';
  G.endAt = 0;
  G.endWin = false;
  input.mouseHeld = false;
  input.dragging = false;
  input.jumpQueued = false;
  for (const k in keys) delete keys[k];
  clearBots();
  resetWeapon();
  menuAngle = 0;
  camera.rotation.set(0, 0, 0);
  showMenuUI();
}

/* --------------------------------------------------------------- 主循环 */
function updateMenuCamera(dt) {
  menuAngle += dt * 0.07;
  const r = 44;
  camera.position.set(Math.sin(menuAngle) * r, 23, 40 + Math.cos(menuAngle) * 10);
  camera.lookAt(0, 2, 0);
}
let menuAngle = 0;

let lastTime = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (G.state === 'playing') {
    G.time += dt;
    updateGame(dt);
  } else if (G.state === 'menu') {
    updateMenuCamera(dt);
  }
  // dying / end / paused：冻结游戏逻辑

  if (G.endAt && performance.now() >= G.endAt) {
    G.endAt = 0;
    showEnd(G.endWin);
  }

  updateGunVisual(dt);

  renderer.render(scene, camera);

  /* 第二遍只画枪械：关闭自动清屏，只清深度，避免把世界画面清成黑色 */
  const showGun = G.state === 'playing' || G.state === 'paused' || G.state === 'dying';
  if (showGun) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(gunScene, gunCamera);
    renderer.autoClear = true;
  }
}

/* --------------------------------------------------------------- 自适应 */
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  gunCamera.aspect = w / h;
  gunCamera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
});

/* --------------------------------------------------------------- 初始化 */
hooks.onPlayerDeath = playerDie;

bindInput({
  look,
  shoot: playerShoot,
  reload: startReload,
  pause: togglePause,
  resume: resumeGame,
  start: startGame,
});

initKeySettings();

dom.startBtn.addEventListener('click', () => startGame());
dom.restartBtn.addEventListener('click', () => startGame());
dom.resumeBtn.addEventListener('click', () => resumeGame());
dom.restartPauseBtn.addEventListener('click', () => startGame());
dom.quitBtn.addEventListener('click', () => quitToMenu());

/* 方便自动化截图/调试：?auto=1 直接进入游戏 */
try {
  const params = new URLSearchParams(location.search);
  if (params.get('auto') === '1') startGame();
} catch (e) { /* ignore */ }

/* 调试接口（仅供自动化测试与排查，不影响正常游玩） */
window.__dust = {
  G,
  player,
  camera,
  keys,
  bindings,
  look,
  playerShoot,
  damagePlayer,
  startGame,
  groundHeightAt,
  resolveCollision,
  get bots() { return bots; },
  get colliders() { return colliders; },
  get shootTargets() { return worldMeshes.concat(getBotHitMeshes()); },
};

/* 初始视角：先贴着玩家，再用鸟瞰视角作为开始界面背景 */
syncCamera();
camera.position.set(2, 12, 52);
camera.lookAt(2, 0, 0);

requestAnimationFrame(loop);
