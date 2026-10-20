/* =========================================================================
   按键设置面板（暂停菜单里打开）
   点击某个动作的按键按钮后进入“录制”状态，下一次按键即完成绑定；
   重复键自动与被占用的动作交换；所有改动实时写入 localStorage。
   ========================================================================= */

import { dom } from './dom.js';
import {
  ACTIONS, bindings, keyLabel, resetBindings, setBinding, setRebinding, isReserved,
} from '../core/bindings.js';

let listening = null;   // 正在录制按键的 action id
let open = false;

export function isKeySettingsOpen() { return open; }

/* --------------------------------------------------------------- 初始化 */
export function initKeySettings() {
  dom.keyRows.innerHTML = '';
  for (const a of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'keyRow';

    const label = document.createElement('span');
    label.className = 'kLabel';
    label.textContent = a.label;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keyBtn';
    btn.dataset.action = a.id;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      beginListen(a.id);
    });

    row.append(label, btn);
    dom.keyRows.appendChild(row);
  }

  dom.settingsBtn.addEventListener('click', showKeySettings);
  dom.backToMenuBtn.addEventListener('click', hideKeySettings);
  dom.resetKeysBtn.addEventListener('click', () => {
    resetBindings();
    render();
    refreshHints();
  });

  /* 捕获阶段监听：录制时吞掉事件，避免同时触发移动/暂停 */
  window.addEventListener('keydown', captureKey, true);
  window.addEventListener('blur', cancelListen);

  render();
  refreshHints();
}

/* --------------------------------------------------------------- 显示 / 隐藏 */
export function showKeySettings() {
  open = true;
  dom.menuBtns.classList.add('hidden');
  dom.keySettings.classList.remove('hidden');
  render();
}

export function hideKeySettings() {
  open = false;
  cancelListen();
  dom.keySettings.classList.add('hidden');
  dom.menuBtns.classList.remove('hidden');
}

/* --------------------------------------------------------------- 录制 */
function beginListen(id) {
  cancelListen();
  listening = id;
  setRebinding(true);
  render();
}

function cancelListen() {
  if (!listening) return;
  const wasListening = !!listening;
  listening = null;
  if (wasListening) setRebinding(false);
  render();
}

function captureKey(e) {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (e.code === 'Escape') { cancelListen(); return; }

  if (isReserved(e.code)) {
    dom.ksTip.textContent = 'Esc 已固定用于暂停菜单，请换一个键。';
    dom.ksTip.classList.add('warn');
    clearTimeout(captureKey.warnTimer);
    captureKey.warnTimer = setTimeout(() => {
      dom.ksTip.textContent = '点击按键后按下新键，Esc 取消；重复的按键会自动交换。设置保存在本机浏览器。';
      dom.ksTip.classList.remove('warn');
    }, 1800);
    return;
  }

  const id = listening;
  listening = null;
  setRebinding(false);
  setBinding(id, e.code);
  render();
  refreshHints();
}

/* --------------------------------------------------------------- 渲染 */
function render() {
  const btns = dom.keyRows.querySelectorAll('.keyBtn');
  for (const btn of btns) {
    const id = btn.dataset.action;
    const active = listening === id;
    btn.classList.toggle('listening', active);
    btn.textContent = active ? '按下按键…' : keyLabel(bindings[id]);
    btn.title = '点击后按下新按键';
  }
  dom.keySettings.classList.toggle('isListening', !!listening);
}

/* --------------------------------------------------------------- 提示文字 */
export function refreshHints() {
  const k = (id) => keyLabel(bindings[id]);

  dom.hintBar.textContent =
    `${k('forward')}${k('left')}${k('back')}${k('right')} 移动 · 左键拖动转向 / 射击 · `
    + `${k('jump')} 跳跃 · ${k('walk')} 静步 · ${k('crouch')} 蹲下 · `
    + `${k('reload')} 换弹 · ${k('lock')} 锁定鼠标 · Esc 暂停`;

  for (const el of document.querySelectorAll('kbd[data-bind]')) {
    el.textContent = k(el.dataset.bind);
  }
}
