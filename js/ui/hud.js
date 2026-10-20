/* =========================================================================
   HUD 与 2D 小地图
   - 顶部/底部状态条、准星、命中标记、击杀信息
   - 小地图底图只绘制一次，之后每帧只叠加敌人与玩家朝向
   ========================================================================= */

import { dom } from './dom.js';
import { MINI } from '../core/config.js';
import { AREAS, AREA_NAMES } from '../world/map.js';
import { G, player, currentWeapon, currentAmmo, currentReserve } from '../core/state.js';
import { playHit } from '../world/audio.js';

/* 敌人列表由 game.js 注入，避免 hud 反向依赖 bots 模块 */
let botSource = () => [];
export function bindBotSource(fn) {
  botSource = fn;
}

let hudCache = { hp: -1, ammo: -1, res: -1, kills: -1, rem: -1, reload: null, weapon: '' };
const killFeedTimers = [];

/** 弹匣数字：近战武器不显示数字 */
function ammoText() {
  const w = currentWeapon();
  if (w.kind === 'melee') return '∞';
  return String(currentAmmo()).padStart(2, '0');
}

export function resetHUD() {
  hudCache = { hp: -1, ammo: -1, res: -1, kills: -1, rem: -1, reload: null, weapon: '' };
}

export function updateHUD() {
  const hp = Math.max(0, Math.ceil(player.hp));
  if (hp !== hudCache.hp) {
    hudCache.hp = hp;
    dom.hpNum.textContent = String(hp);
    dom.hpBar.style.width = hp + '%';
    dom.hpBar.style.background = hp > 55
      ? 'linear-gradient(90deg,#6ecb4a,#b6e56a)'
      : hp > 25
        ? 'linear-gradient(90deg,#e0a63a,#f5cf6b)'
        : 'linear-gradient(90deg,#c33b2b,#ef6a4c)';
  }

  /* 当前武器：名字、弹药与槽位高亮 */
  const w = currentWeapon();
  if (G.weapon !== hudCache.weapon) {
    hudCache.weapon = G.weapon;
    hudCache.ammo = -1;
    hudCache.res = -2;
    hudCache.reload = null;
    dom.ammoCap.textContent = w.name + ' · ' + w.ammoLabel;
    for (const el of dom.weaponList.querySelectorAll('.wSlot')) {
      el.classList.toggle('active', el.dataset.slot === G.weapon);
    }
  }

  if (G.reloading !== hudCache.reload) {
    hudCache.reload = G.reloading;
    dom.ammoNum.textContent = G.reloading ? '--' : ammoText();
  } else if (!G.reloading && (currentAmmo() !== hudCache.ammo || w.kind === 'melee')) {
    hudCache.ammo = currentAmmo();
    dom.ammoNum.textContent = ammoText();
  }

  /* 备弹：近战武器显示破折号 */
  const res = w.kind === 'gun' ? currentReserve() : -1;
  if (res !== hudCache.res) {
    hudCache.res = res;
    dom.ammoRes.textContent = w.kind === 'gun' ? String(res) : '—';
  }

  if (G.kills !== hudCache.kills) {
    hudCache.kills = G.kills;
    dom.killCount.textContent = String(G.kills);
  }

  let rem = 0;
  for (const b of botSource()) if (b.alive) rem++;
  if (rem !== hudCache.rem) {
    hudCache.rem = rem;
    dom.remaining.textContent = String(rem);
  }
}

let hitTimer = 0;

export function showHitmarker(head) {
  dom.hitmarker.classList.remove('show', 'head');
  void dom.hitmarker.offsetWidth;
  dom.hitmarker.classList.add('show');
  if (head) dom.hitmarker.classList.add('head');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => dom.hitmarker.classList.remove('show'), 130);
  playHit();
}

export function addKillFeed(name) {
  const div = document.createElement('div');
  div.className = 'feedItem';
  div.innerHTML = '<span class="feedYou">你</span><span class="feedIcon">⌖</span>'
    + '<span class="feedBot">' + name + '</span>';
  dom.killfeed.appendChild(div);
  while (dom.killfeed.children.length > 4) dom.killfeed.removeChild(dom.killfeed.firstChild);
  const t = setTimeout(() => {
    div.classList.add('out');
    setTimeout(() => div.remove(), 420);
  }, 2600);
  killFeedTimers.push(t);
}

/* --------------------------------------------------------------- 小地图 */
const miniCtx = dom.minimap.getContext('2d');
const miniScale = (MINI.size - MINI.pad * 2) / 92;
const mX = (x) => MINI.pad + (x + 46) * miniScale;
const mZ = (z) => MINI.pad + (z + 46) * miniScale;

let miniBase = null;

export function buildMinimapBase() {
  const c = document.createElement('canvas');
  c.width = c.height = MINI.size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d100c';
  ctx.fillRect(0, 0, MINI.size, MINI.size);

  ctx.fillStyle = 'rgba(212,184,133,0.85)';
  for (const a of AREAS) {
    ctx.fillRect(mX(a[0]), mZ(a[1]), (a[2] - a[0]) * miniScale, (a[3] - a[1]) * miniScale);
  }

  ctx.strokeStyle = 'rgba(80,60,35,0.65)';
  ctx.lineWidth = 1;
  for (const a of AREAS) {
    ctx.strokeRect(mX(a[0]) + 0.5, mZ(a[1]) + 0.5, (a[2] - a[0]) * miniScale - 1, (a[3] - a[1]) * miniScale - 1);
  }

  ctx.fillStyle = 'rgba(28,30,20,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.fillText('A', mX(28), mZ(-36));
  ctx.fillText('B', mX(-31), mZ(-35));
  ctx.font = 'bold 9px "Segoe UI", sans-serif';
  ctx.fillText('CT', mX(-3), mZ(-37));
  ctx.fillText('T', mX(20), mZ(41));

  /* 区域名（小号字），让玩家知道自己在哪 */
  ctx.fillStyle = 'rgba(240,220,180,0.42)';
  ctx.font = '7px "Segoe UI", sans-serif';
  for (const name in AREA_NAMES) {
    const a = AREA_NAMES[name];
    ctx.fillText(name, mX((a[0] + a[2]) / 2), mZ((a[1] + a[3]) / 2));
  }
  miniBase = c;
}
buildMinimapBase();

export function drawMinimap() {
  const ctx = miniCtx;
  ctx.clearRect(0, 0, MINI.size, MINI.size);
  if (miniBase) ctx.drawImage(miniBase, 0, 0);

  for (const b of botSource()) {
    if (!b.alive) continue;
    const x = mX(b.group.position.x), z = mZ(b.group.position.z);
    ctx.beginPath();
    ctx.arc(x, z, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5540';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const px = mX(player.pos.x), pz = mZ(player.pos.z);
  const ang = Math.atan2(-Math.cos(G.yaw), -Math.sin(G.yaw));
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, 4);
  ctx.lineTo(-4, -4);
  ctx.closePath();
  ctx.fillStyle = '#ffe9b0';
  ctx.fill();
  ctx.strokeStyle = '#1a1a14';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,220,160,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, MINI.size - 1, MINI.size - 1);
}
