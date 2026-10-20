/* =========================================================================
   全局可调参数
   想调整手感、难度或地图边界，优先改这里。
   ========================================================================= */

/* 玩家 */
export const EYE_HEIGHT = 1.66;      // 视点高度
export const PLAYER_RADIUS = 0.42;   // 碰撞半径
export const PLAYER_HEIGHT = 1.78;   // 碰撞高度
export const RUN_SPEED = 6.3;        // 奔跑速度
export const WALK_SPEED = 3.0;       // 静步速度
export const CROUCH_SPEED = 2.2;     // 蹲下移动速度
export const CROUCH_EYE = 1.12;      // 蹲下视点高度
export const CROUCH_HEIGHT = 1.2;    // 蹲下碰撞高度
export const GRAVITY = 20;
export const JUMP_SPEED = 6.6;
export const LOOK_SENS = 0.0022;     // 鼠标灵敏度

/* 武器：具体参数见 js/core/weapons.js（每把枪独立的伤害/射速/弹匣） */
export const MAX_AMMO = 30;
export const RELOAD_TIME = 1.45;
export const FIRE_INTERVAL = 0.105;  // 连发间隔（秒）

/* 敌人 */
export const BOT_PATROL_SPEED = 2.4;
export const BOT_CHASE_SPEED = 3.8;
export const BOT_ATTACK_RANGE = 20;
export const BOT_MAX_HP = 100;

/* 难度：开局菜单可选，影响敌人枪法、伤害、射速、移动与视野
   accuracy 基础命中率，falloff 距离衰减，damageMul 伤害倍率，
   fire 射击间隔区间（秒），speed 移动倍率，sight 视野距离，alert 发现玩家后的反应时间 */
export const DIFFICULTY = {
  easy: {
    label: '简单', tag: '敌人枪法差、反应慢、伤害低',
    accuracy: 0.40, falloff: 0.007, damageMul: 0.65,
    fire: [1.5, 2.3], speed: 0.82, sight: 28, alert: 0.8,
  },
  normal: {
    label: '普通', tag: '标准交火手感',
    accuracy: 0.62, falloff: 0.012, damageMul: 1.0,
    fire: [0.95, 1.65], speed: 1.0, sight: 38, alert: 0.45,
  },
  hard: {
    label: '困难', tag: '敌人更准、更快、伤害更高',
    accuracy: 0.80, falloff: 0.009, damageMul: 1.35,
    fire: [0.6, 1.0], speed: 1.18, sight: 46, alert: 0.2,
  },
};

/* 地图 */
export const MAP_LIMIT = 43.6;

/* 小地图 */
export const MINI = { size: 176, pad: 8 };
