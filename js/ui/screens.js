/* =========================================================================
   开始 / 暂停 / 结算界面
   只负责显示层，游戏状态的切换由 game.js 决定。
   ========================================================================= */

import { dom } from './dom.js';
import { G } from '../core/state.js';

/** 进入战场：隐藏所有覆盖层，显示 HUD，清空击杀信息 */
export function showGameUI() {
  dom.startScreen.classList.add('hidden');
  dom.endScreen.classList.add('hidden');
  dom.pauseScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  dom.killfeed.innerHTML = '';
}

/** 回到主菜单：隐藏 HUD 与所有局内界面 */
export function showMenuUI() {
  dom.startScreen.classList.remove('hidden');
  dom.pauseScreen.classList.add('hidden');
  dom.endScreen.classList.add('hidden');
  dom.hud.classList.add('hidden');
}

export function showPauseUI() {
  dom.pauseScreen.classList.remove('hidden');
}

export function hidePauseUI() {
  dom.pauseScreen.classList.add('hidden');
}

/** 结算界面 */
export function showEndUI(win) {
  dom.hud.classList.add('hidden');
  dom.endScreen.classList.remove('hidden');
  dom.endEyebrow.textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  dom.endTitle.textContent = win ? '任务完成' : '你已阵亡';
  dom.endTitle.className = win ? '' : 'fail';
  dom.endDesc.textContent = win
    ? '所有恐怖分子已被清除，A 区与 B 区恢复安全。干得漂亮，反恐精英。'
    : '你被恐怖分子击倒，任务失败。利用掩体、控制交火距离，再试一次。';
  dom.endKills.textContent = String(G.kills);

  const secs = Math.max(0, Math.round(G.time));
  dom.endTime.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  dom.endAccuracy.textContent = (G.shotsFired ? Math.round((G.shotsHit / G.shotsFired) * 100) : 0) + '%';
}
