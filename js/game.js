/* =========================================================================
   游戏主流程
   负责：射击与换弹、玩家死亡与胜负判定、主循环、开始/暂停/结算、
   以及把输入层的事件接到具体动作上。
   ========================================================================= */

import { THREE } from './core/three.js';
import { G, player, keys, input, hooks, currentWeapon } from './core/state.js';
import { WEAPON_LIST, WEAPON_SLOTS, WEAPONS } from './core/weapons.js';
import { camera, scene, renderer, gunScene, gunCamera, getQualityLevel } from './world/scene.js';
import { worldMeshes, groundHeightAt, resolveCollision, colliders } from './world/map.js';
import {
  spawnTracer, spawnImpact, spawnBlood, addBulletHole, updateEffects, clearEffects,
} from './world/effects.js';
import { tuneQuality } from './world/scene.js';
import {
  initAudio, playGunshot, playAkShot, playReload, playKnifeSwing, playKnifeHit, playSwitch,
} from './world/audio.js';
import { kickWeapon, resetWeapon, updateGunVisual, setWeaponModel, swingKnife, getWeaponModelId } from './world/weapon.js';
import { look, updatePlayer, syncCamera, updateRecoil, damagePlayer } from './entities/player.js';
import { bots, spawnBots, clearBots, getBotHitMeshes, getBotVersion } from './entities/bots.js';
import { updateHUD, drawMinimap, resetHUD, bindBotSource, showHitmarker } from './ui/hud.js';
import { showGameUI, showPauseUI, hidePauseUI, showEndUI, showMenuUI } from './ui/screens.js';
import { dom } from './ui/dom.js';
import { bindInput, releasePointerLock } from './core/input.js';
import { bindings, loadBindings } from './core/bindings.js';
import { prefs, loadPrefs } from './core/prefs.js';
import { initKeySettings, hideKeySettings, isKeySettingsOpen } from './ui/settings.js';
import { initSetupUI } from './ui/setup.js';

/* HUD 需要敌人列表，这里注入，避免 ui → entities 的循环依赖 */
bindBotSource(() => bots);

/* 先恢复玩家上次保存的键位与开局偏好，再让输入层和设置面板开始工作 */
loadBindings();
loadPrefs();

/* --------------------------------------------------------------- 射击 */
const shootRay = new THREE.Raycaster();
const meleeRay = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const muzzleWorld = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();
const tmpNormalMat = new THREE.Matrix3();
const tmpBlock = new THREE.Vector3();
const tmpHitPoint = new THREE.Vector3();

/* 射击目标列表缓存：世界网格不变，只有敌人网格会增减，
   用版本号避免每发子弹都重新 concat 数组。 */
let shootTargets = [];
let shootTargetsVersion = -1;
function refreshShootTargets() {
  const v = getBotVersion();
  if (v === shootTargetsVersion) return;
  shootTargetsVersion = v;
  shootTargets = worldMeshes.concat(getBotHitMeshes());
}

function getMuzzleWorld() {
  return muzzleWorld
    .set(0.24, -0.16, -0.95)
    .applyQuaternion(camera.quaternion)
    .add(camera.position);
}

/* 切枪动画时长（秒），期间不能开火 */
const SWITCH_TIME = 0.34;

/** 切换到指定武器；切枪会打断换弹 */
export function switchWeapon(id) {
  if (G.state !== 'playing') return;
  if (!WEAPONS[id] || id === G.weapon || G.switching > 0) return;
  G.switching = SWITCH_TIME;
  G.weapon = id;
  G.reloading = false;
  G.reloadEnd = 0;
  G.nextShot = Math.max(G.nextShot, G.time + SWITCH_TIME);
  setWeaponModel(id);
  playSwitch();
  updateHUD();
}

/** 鼠标滚轮 / 数字键循环切换武器 */
export function cycleWeapon(dir) {
  const i = WEAPON_SLOTS.indexOf(G.weapon);
  const n = WEAPON_SLOTS.length;
  switchWeapon(WEAPON_SLOTS[(i + dir + n * 2) % n]);
}

export function playerShoot() {
  if (G.state !== 'playing' || G.reloading) return;
  if (G.switching > 0) return;
  if (G.time < G.nextShot) return;

  const w = currentWeapon();
  if (w.kind === 'melee') { meleeAttack(w); return; }

  const mag = G.ammo[w.id];
  if (mag.mag <= 0) { startReload(); return; }

  mag.mag--;
  G.nextShot = G.time + w.fireInterval;
  G.shotsFired++;
  G.recoil = Math.min(w.maxRecoil, G.recoil + w.recoil * (1 - player.crouchAmt * 0.35));
  G.recoilYaw += (Math.random() - 0.5) * w.recoilYaw;
  G.bloom = Math.min(1, G.bloom + w.bloom);
  G.shake = Math.min(0.5, G.shake + w.shake);
  kickWeapon();
  if (w.sound === 'ak') playAkShot(); else playGunshot();

  /* 移动中与连续射击会扩大散布；蹲下则收束散布 */
  const moving = player.moveAmt > 0.25;
  const crouchFactor = 1 - player.crouchAmt * 0.5;
  const spread = (w.spread.base + (moving ? w.spread.move : 0) + G.bloom * w.spread.bloom) * crouchFactor;
  camera.getWorldDirection(tmpDir);
  tmpDir.x += (Math.random() - 0.5) * spread;
  tmpDir.y += (Math.random() - 0.5) * spread;
  tmpDir.z += (Math.random() - 0.5) * spread;
  tmpDir.normalize();

  shootRay.set(camera.position, tmpDir);
  shootRay.far = 240;

  refreshShootTargets();
  const hits = shootRay.intersectObjects(shootTargets, false);
  const hit = hits.length ? hits[0] : null;
  const muzzle = getMuzzleWorld();

  if (hit) {
    spawnTracer(muzzle, hit.point, 0xffe0a0, 0.07);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      G.shotsHit++;
      const part = hit.object.userData.part;
      const dmg = part === 'head' ? w.damage.head : part === 'body' ? w.damage.body : w.damage.leg;
      spawnBlood(hit.point, part === 'head');
      bot.takeDamage(dmg);
      showHitmarker(part === 'head');
    } else {
      if (hit.face) {
        tmpNormal.copy(hit.face.normal)
          .applyMatrix3(tmpNormalMat.getNormalMatrix(hit.object.matrixWorld))
          .normalize();
      } else {
        tmpNormal.set(0, 1, 0);
      }
      spawnImpact(hit.point, tmpNormal);
      addBulletHole(hit);
    }
  } else {
    tmpEnd.copy(camera.position).addScaledVector(tmpDir, 130);
    spawnTracer(muzzle, tmpEnd, 0xffe0a0, 0.07);
  }

  if (mag.mag <= 0) startReload();
  updateHUD();
}

/**
 * 近战挥击：正前方扇形范围内、视线通畅的第一个敌人会被击中。
 * 距离越近伤害越高（贴身刺击最疼）。
 */
function meleeAttack(w) {
  G.nextShot = G.time + w.fireInterval;
  G.shotsFired++;
  swingKnife();
  playKnifeSwing();
  G.shake = Math.min(0.4, G.shake + 0.05);

  camera.getWorldDirection(tmpDir);
  meleeRay.set(camera.position, tmpDir);
  meleeRay.far = w.range;

  refreshShootTargets();
  const hits = meleeRay.intersectObjects(shootTargets, false);
  let hit = null;
  for (const h of hits) {
    const bot = h.object.userData.bot;
    if (bot && bot.alive) { hit = h; break; }
    /* 被墙挡住就挥空 */
    break;
  }

  if (hit) {
    const bot = hit.object.userData.bot;
    const part = hit.object.userData.part;
    /* 贴身程度：越近伤害越高（1.0 → 1.6 倍） */
    const dist = hit.distance;
    const close = Math.max(1, Math.min(1.6, 1 + (w.range - dist) * 0.35));
    const base = part === 'head' ? w.damage.head : part === 'body' ? w.damage.body : w.damage.leg;
    const dmg = Math.round(base * close);
    G.shotsHit++;
    spawnBlood(hit.point, part === 'head');
    bot.takeDamage(dmg);
    showHitmarker(part === 'head');
    playKnifeHit();
  }
  updateHUD();
}

export function startReload() {
  if (G.state !== 'playing' || G.reloading || G.switching > 0) return;
  const w = currentWeapon();
  if (w.kind !== 'gun') return;
  const mag = G.ammo[w.id];
  if (mag.mag >= w.magSize || mag.reserve <= 0) return;
  G.reloading = true;
  G.reloadEnd = G.time + w.reloadTime;
  playReload();
}

export function finishReload() {
  const w = currentWeapon();
  const mag = G.ammo[w.id];
  if (mag) {
    const need = w.magSize - mag.mag;
    const take = Math.min(need, mag.reserve);
    mag.mag += take;
    mag.reserve -= take;
  }
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

  if (G.switching > 0) {
    G.switching = Math.max(0, G.switching - dt);
    /* 切枪动画结束时解锁 */
    if (G.switching === 0) G.nextShot = Math.max(G.nextShot, G.time);
  }

  /* 自动武器按住左键连发；近战武器只在按下瞬间挥一次 */
  if (input.mouseHeld && currentWeapon().automatic) playerShoot();
  if (G.reloading && G.time >= G.reloadEnd) finishReload();

  for (const b of bots) b.update(dt);
  updateEffects(dt);
  updateRecoil(dt);
  tuneQuality(dt);

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
  G.weapon = 'm4a1';
  for (const w of WEAPON_LIST) {
    G.ammo[w.id] = { mag: w.magSize, reserve: w.reserve };
  }
  G.switching = 0;
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
  spawnBots(prefs.botCount);
  refreshShootTargets();
  clearEffects();
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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
  weapon: switchWeapon,
  weaponCycle: cycleWeapon,
});

initKeySettings();
initSetupUI();

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
  prefs,
  look,
  playerShoot,
  switchWeapon,
  cycleWeapon,
  damagePlayer,
  startGame,
  groundHeightAt,
  resolveCollision,
  get bots() { return bots; },
  get colliders() { return colliders; },
  get shootTargets() { return shootTargets; },
  get quality() { return getQualityLevel(); },
  renderer,
};

/* 初始视角：先贴着玩家，再用鸟瞰视角作为开始界面背景 */
syncCamera();
camera.position.set(2, 12, 52);
camera.lookAt(2, 0, 0);

requestAnimationFrame(loop);
