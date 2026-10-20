/* =========================================================================
   开局偏好：难度与敌人数量
   保存在 localStorage，开始界面修改后立即生效并记住。
   ========================================================================= */

import { DIFFICULTY } from './config.js';

const STORAGE_KEY = 'dust2.prefs.v1';

/** 可选的敌人数量 */
export const BOT_COUNTS = [3, 6, 9];

/** 当前偏好（默认普通 / 6 人） */
export const prefs = {
  difficulty: 'normal',
  botCount: 6,
};

export function currentDifficulty() {
  return DIFFICULTY[prefs.difficulty] || DIFFICULTY.normal;
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && DIFFICULTY[data.difficulty]) prefs.difficulty = data.difficulty;
    if (data && BOT_COUNTS.includes(data.botCount)) prefs.botCount = data.botCount;
  } catch (e) {
    /* 存储不可用或内容损坏时退回默认值 */
  }
}

export function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    /* 隐私模式下 localStorage 可能不可写，忽略即可 */
  }
}

export function setDifficulty(key) {
  if (!DIFFICULTY[key]) return;
  prefs.difficulty = key;
  savePrefs();
}

export function setBotCount(count) {
  if (!BOT_COUNTS.includes(count)) return;
  prefs.botCount = count;
  savePrefs();
}
