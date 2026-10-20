/* =========================================================================
   共享运行状态
   所有模块都从这里读写游戏状态，避免互相引用造成循环依赖。
   ========================================================================= */

import { THREE } from './three.js';
import { WEAPON_LIST, getWeapon } from './weapons.js';

/* 整局游戏状态 */
export const G = {
  state: 'menu',          // menu | playing | paused | dying | end
  time: 0,
  yaw: 0,
  pitch: 0,
  recoil: 0,
  recoilYaw: 0,
  bloom: 0,
  shake: 0,
  kills: 0,
  reloading: false,
  reloadEnd: 0,
  nextShot: 0,
  shotsFired: 0,
  shotsHit: 0,
  endAt: 0,
  endWin: false,
  /* 当前武器 id */
  weapon: 'm4a1',
  /* 每把武器的弹药：{ mag, reserve } */
  ammo: {},
  /* 切枪动画锁：切枪期间不能开火 */
  switching: 0,
};

/* 初始化每把武器的弹匣与备弹 */
for (const w of WEAPON_LIST) {
  G.ammo[w.id] = { mag: w.magSize, reserve: w.reserve };
}

/** 当前武器定义 */
export function currentWeapon() {
  return getWeapon(G.weapon);
}

/** 当前弹匣子弹数 */
export function currentAmmo() {
  const a = G.ammo[G.weapon];
  return a ? a.mag : 0;
}

/** 当前武器的备弹 */
export function currentReserve() {
  const a = G.ammo[G.weapon];
  return a ? a.reserve : 0;
}

/* 玩家实体 */
export const player = {
  pos: new THREE.Vector3(2, 0, 38),
  vel: new THREE.Vector3(),
  vy: 0,
  hp: 100,
  onGround: true,
  bobPhase: 0,
  moveAmt: 0,
  crouchAmt: 0,   // 0 = 站立，1 = 完全蹲下
};

/* 键盘按下状态（键码 -> bool） */
export const keys = Object.create(null);

/* 输入层运行时状态 */
export const input = {
  mouseHeld: false,
  jumpQueued: false,
  dragging: false,
  dragX: 0,
  dragY: 0,
  swayX: 0,   // 视角摆动（枪械模型用）
  swayY: 0,
};

/* 由 game.js 注入的回调，避免低层模块反向依赖游戏流程 */
export const hooks = {
  onPlayerDeath: null,
};
