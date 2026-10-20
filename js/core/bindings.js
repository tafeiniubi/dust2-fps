/* =========================================================================
   按键绑定
   每个动作对应一个 KeyboardEvent.code（不是字符，所以不受输入法/大小写影响）。
   射击固定为鼠标左键，暂停固定为 Esc，不参与自定义。
   绑定结果保存在 localStorage，刷新/下次打开仍然生效。
   ========================================================================= */

import { keys } from './state.js';

export const ACTIONS = [
  { id: 'forward', label: '前进',      def: 'KeyW' },
  { id: 'back',    label: '后退',      def: 'KeyS' },
  { id: 'left',    label: '左移',      def: 'KeyA' },
  { id: 'right',   label: '右移',      def: 'KeyD' },
  { id: 'jump',    label: '跳跃',      def: 'Space' },
  { id: 'walk',    label: '静步',      def: 'ShiftLeft' },
  { id: 'crouch',  label: '蹲下',      def: 'KeyC' },
  { id: 'reload',  label: '换弹',      def: 'KeyR' },
  { id: 'lock',    label: '锁定鼠标',  def: 'KeyL' },
];

const STORE_KEY = 'dust2.bindings.v1';

/* Esc 固定用于暂停菜单，F5/F11/F12 等交给浏览器 */
const RESERVED = new Set(['Escape', 'F5', 'F11', 'F12']);

/** 当前生效的键位：action id → code */
export const bindings = {};
for (const a of ACTIONS) bindings[a.id] = a.def;

/** 设置面板正在等待玩家按键时为 true，输入层据此暂停响应 */
export let rebinding = false;
export function setRebinding(v) { rebinding = !!v; }

export function loadBindings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const a of ACTIONS) {
      if (typeof data[a.id] === 'string' && data[a.id]) bindings[a.id] = data[a.id];
    }
  } catch (e) { /* 忽略损坏的存档 */ }
}

export function saveBindings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(bindings)); } catch (e) { /* 隐私模式 */ }
}

/** 恢复全部默认键位并保存 */
export function resetBindings() {
  for (const a of ACTIONS) bindings[a.id] = a.def;
  saveBindings();
}

/** 该动作当前是否被按住 */
export function isDown(action) {
  const code = bindings[action];
  return !!code && !!keys[code];
}

export function isReserved(code) { return RESERVED.has(code); }

/**
 * 设置一个动作的按键；如果该键已被别的动作占用，则两个动作交换，
 * 这样永远不会出现两个动作抢同一个键的情况。
 */
export function setBinding(action, code) {
  if (!bindings[action] || bindings[action] === code) return;
  const old = bindings[action];
  for (const a of ACTIONS) {
    if (a.id !== action && bindings[a.id] === code) bindings[a.id] = old;
  }
  bindings[action] = code;
  saveBindings();
}

/* --------------------------------------------------------------- 显示名称 */
const NAMED = {
  Space: '空格',
  ShiftLeft: '左 Shift', ShiftRight: '右 Shift',
  ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl',
  AltLeft: '左 Alt', AltRight: '右 Alt',
  MetaLeft: '左 Win', MetaRight: '右 Win',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '回车', NumpadEnter: '小键盘回车',
  Backspace: '退格', Delete: 'Del', Insert: 'Ins',
  Tab: 'Tab', CapsLock: 'CapsLock',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Backslash: '\\', Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: '小键盘 +', NumpadSubtract: '小键盘 -', NumpadMultiply: '小键盘 *',
  NumpadDivide: '小键盘 /', NumpadDecimal: '小键盘 .',
};

export function keyLabel(code) {
  if (!code) return '未设置';
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '小键盘 ' + code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

export function actionLabel(id) { return keyLabel(bindings[id]); }
