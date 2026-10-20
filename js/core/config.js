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

/* 武器 */
export const MAX_AMMO = 30;
export const RELOAD_TIME = 1.45;
export const FIRE_INTERVAL = 0.105;  // 连发间隔（秒）

/* 敌人 */
export const BOT_PATROL_SPEED = 2.4;
export const BOT_CHASE_SPEED = 3.8;
export const BOT_ATTACK_RANGE = 20;
export const BOT_MAX_HP = 100;

/* 地图 */
export const MAP_LIMIT = 43.6;

/* 小地图 */
export const MINI = { size: 176, pad: 8 };
