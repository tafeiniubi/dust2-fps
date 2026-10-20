/* =========================================================================
   输入层
   键鼠事件、鼠标拖拽转向、指针锁定；具体动作通过 bindInput 注入，
   这样输入层不需要知道射击/暂停是怎么实现的。
   ========================================================================= */

import { G, keys, input } from '../core/state.js';
import { dom } from '../ui/dom.js';

let handlers = {};

export function bindInput(h) {
  handlers = h || {};
}

/* --------------------------------------------------------------- 鼠标转向与射击 */
window.addEventListener('mousedown', (e) => {
  if (G.state !== 'playing') return;
  if (e.target && e.target.closest && e.target.closest('button')) return;

  if (e.button === 0) {
    input.mouseHeld = true;
    if (document.pointerLockElement !== dom.canvas) {
      input.dragging = true;
      input.dragX = e.clientX;
      input.dragY = e.clientY;
    }
    if (handlers.shoot) handlers.shoot();
  } else if (e.button === 2) {
    input.dragging = true;
    input.dragX = e.clientX;
    input.dragY = e.clientY;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.mouseHeld = false;
  if (e.button === 0 || e.button === 2) input.dragging = false;
});

window.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing') return;
  if (document.pointerLockElement === dom.canvas) {
    if (handlers.look) handlers.look(e.movementX || 0, e.movementY || 0);
  } else if (input.dragging) {
    const dx = e.clientX - input.dragX;
    const dy = e.clientY - input.dragY;
    input.dragX = e.clientX;
    input.dragY = e.clientY;
    if (handlers.look) handlers.look(dx, dy);
  }
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

/* --------------------------------------------------------------- 键盘 */
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (G.state === 'playing' && handlers.pause) handlers.pause();
    else if (G.state === 'paused' && handlers.resume) handlers.resume();
    e.preventDefault();
    return;
  }

  if (e.code === 'Enter' && G.state === 'menu') {
    if (handlers.start) handlers.start();
    return;
  }

  if (G.state !== 'playing') return;
  if (e.repeat) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }

  keys[e.code] = true;
  if (e.code === 'Space') {
    input.jumpQueued = true;
    e.preventDefault();
  } else if (e.code === 'KeyR') {
    if (handlers.reload) handlers.reload();
  } else if (e.code === 'KeyL') {
    togglePointerLock();
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  input.mouseHeld = false;
  input.dragging = false;
});

/* --------------------------------------------------------------- 指针锁定 */
export function togglePointerLock() {
  if (document.pointerLockElement === dom.canvas) {
    document.exitPointerLock();
  } else if (dom.canvas.requestPointerLock) {
    const p = dom.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
}

export function releasePointerLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
