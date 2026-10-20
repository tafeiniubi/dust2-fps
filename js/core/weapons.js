/* =========================================================================
   武器定义表
   ---------------------------------------------------------------
   所有武器的手感参数集中在这里：伤害、射速、弹匣、后坐力、散布。
   想调整某把枪的"性格"只改这张表，不用动玩法代码。

   kind:
     gun    —— 射线射击，消耗弹药
     melee  —— 近战挥击，不消耗弹药
   ========================================================================= */

/* 部位伤害倍率：爆头 / 躯干 / 腿部 */
export const DAMAGE = {
  m4a1: { head: 120, body: 36, leg: 24 },
  ak47: { head: 130, body: 44, leg: 28 },
  knife: { head: 130, body: 58, leg: 45 },
};

export const WEAPON_LIST = [
  {
    id: 'm4a1',
    name: 'M4A1',
    ammoLabel: '5.56MM',
    kind: 'gun',
    slot: 1,
    magSize: 30,
    reserve: 90,
    fireInterval: 0.105,      // 连发间隔（秒）
    reloadTime: 1.45,
    automatic: true,
    damage: DAMAGE.m4a1,
    recoil: 0.014,            // 每发抬枪
    recoilYaw: 0.012,         // 每发横向抖动
    maxRecoil: 0.085,
    bloom: 0.32,              // 每发散布累积
    shake: 0.05,
    spread: { base: 0.004, move: 0.009, bloom: 0.010 },
    /* 枪口焰与硝烟尺寸 */
    flashScale: 1.0,
    sound: 'm4',
  },
  {
    id: 'ak47',
    name: 'AK-47',
    ammoLabel: '7.62MM',
    kind: 'gun',
    slot: 2,
    magSize: 30,
    reserve: 90,
    fireInterval: 0.098,      // 比 M4 射速略快
    reloadTime: 1.95,         // 弹匣更大，换弹更慢
    automatic: true,
    damage: DAMAGE.ak47,      // 一枪躯干 44，比 M4 更疼
    recoil: 0.024,            // 后坐明显更大
    recoilYaw: 0.019,
    maxRecoil: 0.11,
    bloom: 0.44,
    shake: 0.075,
    spread: { base: 0.006, move: 0.012, bloom: 0.014 },
    flashScale: 1.15,
    sound: 'ak',
  },
  {
    id: 'knife',
    name: '小刀',
    ammoLabel: 'MELEE',
    kind: 'melee',
    slot: 3,
    magSize: 0,
    reserve: 0,
    fireInterval: 0.5,        // 挥击间隔
    reloadTime: 0,
    automatic: false,
    damage: DAMAGE.knife,
    range: 2.35,              // 有效距离
    arc: 0.95,                // 正前方扇形半角（弧度）
    recoil: 0,
    recoilYaw: 0,
    maxRecoil: 0,
    bloom: 0,
    shake: 0.02,
    spread: { base: 0, move: 0, bloom: 0 },
    sound: 'knife',
  },
];

export const WEAPONS = {};
for (const w of WEAPON_LIST) WEAPONS[w.id] = w;

/** 槽位顺序：1 → 2 → 3 */
export const WEAPON_SLOTS = WEAPON_LIST.map((w) => w.id);

export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.m4a1;
}
