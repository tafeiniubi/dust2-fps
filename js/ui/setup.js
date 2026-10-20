/* =========================================================================
   开始界面的难度 / 敌人数选择
   只改 prefs 并同步界面文案，真正生效在 game.js 的 startGame()。
   ========================================================================= */

import { dom } from './dom.js';
import { prefs, setDifficulty, setBotCount, currentDifficulty } from '../core/prefs.js';

function paint() {
  const d = currentDifficulty();

  for (const btn of dom.diffGroup.querySelectorAll('.segBtn')) {
    btn.classList.toggle('active', btn.dataset.diff === prefs.difficulty);
  }
  for (const btn of dom.countGroup.querySelectorAll('.segBtn')) {
    btn.classList.toggle('active', Number(btn.dataset.count) === prefs.botCount);
  }

  dom.startBrief.textContent = `沙漠二号。${prefs.botCount} 名恐怖分子已分散占据 A 大通道、A 包点、`
    + 'B 洞、B 包点、中路与 CT 出生点。穿过走廊与包点，清除全部目标。';
  dom.setupHint.textContent = `${d.label} · ${d.tag} · ${prefs.botCount} 名敌人`;
}

export function initSetupUI() {
  dom.diffGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.segBtn');
    if (!btn) return;
    setDifficulty(btn.dataset.diff);
    paint();
  });

  dom.countGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.segBtn');
    if (!btn) return;
    setBotCount(Number(btn.dataset.count));
    paint();
  });

  paint();
}
