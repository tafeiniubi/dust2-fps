/* =========================================================================
   玩家：视角、移动、相机同步、受伤
   ========================================================================= */

import { camera } from '../world/scene.js';
import {
  EYE_HEIGHT, PLAYER_RADIUS, PLAYER_HEIGHT, RUN_SPEED, WALK_SPEED,
  CROUCH_SPEED, CROUCH_EYE, CROUCH_HEIGHT,
  GRAVITY, JUMP_SPEED, LOOK_SENS, MAP_LIMIT,
} from '../core/config.js';
import { G, player, keys, input, hooks } from '../core/state.js';
import { bindings, isDown } from '../core/bindings.js';
import { groundHeightAt, resolveCollision } from '../world/map.js';
import { updateHUD } from '../ui/hud.js';
import { playHurt } from '../world/audio.js';
import { dom } from '../ui/dom.js';

export function clampPitch() {
  G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch));
}

/** 鼠标输入：转向 + 枪械摆动 */
export function look(dx, dy) {
  G.yaw -= dx * LOOK_SENS;
  G.pitch -= dy * LOOK_SENS;
  clampPitch();
  input.swayX = Math.max(-1, Math.min(1, input.swayX + dx * 0.02));
  input.swayY = Math.max(-1, Math.min(1, input.swayY + dy * 0.02));
}

export function updatePlayer(dt) {
  const forwardX = -Math.sin(G.yaw), forwardZ = -Math.cos(G.yaw);
  const rightX = Math.cos(G.yaw), rightZ = -Math.sin(G.yaw);

  let wx = 0, wz = 0;
  if (isDown('forward')) { wx += forwardX; wz += forwardZ; }
  if (isDown('back')) { wx -= forwardX; wz -= forwardZ; }
  if (isDown('right')) { wx += rightX; wz += rightZ; }
  if (isDown('left')) { wx -= rightX; wz -= rightZ; }
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }

  /* 静步默认绑定左 Shift；未改键时右 Shift 也可以 */
  const walking = isDown('walk') || (bindings.walk === 'ShiftLeft' && !!keys['ShiftRight']);
  /* 蹲下：按住生效，视点与碰撞高度平滑过渡 */
  const crouching = isDown('crouch');
  player.crouchAmt += ((crouching ? 1 : 0) - player.crouchAmt) * (1 - Math.exp(-16 * dt));
  const speed = crouching ? CROUCH_SPEED : walking ? WALK_SPEED : RUN_SPEED;
  const accel = player.onGround ? 13 : 2.5;
  const k = 1 - Math.exp(-accel * dt);
  player.vel.x += (wx * speed - player.vel.x) * k;
  player.vel.z += (wz * speed - player.vel.z) * k;

  const ox = player.pos.x, oz = player.pos.z;
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  const bodyH = PLAYER_HEIGHT + (CROUCH_HEIGHT - PLAYER_HEIGHT) * player.crouchAmt;
  resolveCollision(player.pos, PLAYER_RADIUS, player.pos.y, bodyH);

  // 落差过大（比如台阶太高）就退回原位，等于被挡住
  const ghAhead = groundHeightAt(player.pos.x, player.pos.z, player.pos.y);
  if (ghAhead > player.pos.y + 0.62) {
    player.pos.x = ox;
    player.pos.z = oz;
  }
  player.pos.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, player.pos.x));
  player.pos.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, player.pos.z));

  const gh = groundHeightAt(player.pos.x, player.pos.z, player.pos.y);
  if (player.onGround) {
    if (gh < player.pos.y - 0.35) {
      player.onGround = false;
      player.vy = 0;
    } else {
      player.pos.y = gh;
    }
  }
  if (!player.onGround) {
    player.vy -= GRAVITY * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= gh) {
      player.pos.y = gh;
      player.vy = 0;
      player.onGround = true;
      G.shake = Math.min(0.4, G.shake + 0.1);
    }
  }

  if (input.jumpQueued && player.onGround) {
    player.vy = JUMP_SPEED;
    player.onGround = false;
    player.pos.y += 0.02;
  }
  input.jumpQueued = false;

  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  player.moveAmt = Math.min(1, hSpeed / RUN_SPEED);
  if (player.onGround && hSpeed > 0.3) player.bobPhase += dt * (6 + hSpeed * 0.9);
}

export function syncCamera() {
  const eye = EYE_HEIGHT + (CROUCH_EYE - EYE_HEIGHT) * player.crouchAmt;
  const bob = Math.sin(player.bobPhase * 2) * 0.03 * player.moveAmt * (1 - 0.55 * player.crouchAmt);
  const shakeX = (Math.random() - 0.5) * G.shake * 0.02;
  const shakeY = (Math.random() - 0.5) * G.shake * 0.02;
  camera.position.set(player.pos.x, player.pos.y + eye + bob, player.pos.z);
  camera.rotation.set(
    G.pitch + G.recoil + shakeX,
    G.yaw + G.recoilYaw + shakeY,
    (Math.random() - 0.5) * G.shake * 0.012
  );
}

export function updateRecoil(dt) {
  G.recoil *= Math.exp(-dt * 6.5);
  G.recoilYaw *= Math.exp(-dt * 6.5);
  G.bloom *= Math.exp(-dt * 3.0);
  G.shake *= Math.exp(-dt * 7);
  if (G.shake < 0.001) G.shake = 0;
}

let damageTimer = 0;

/** 玩家受伤；归零时通过 hooks 通知游戏流程 */
export function damagePlayer(amount) {
  if (G.state !== 'playing') return;
  player.hp -= amount;
  G.shake = Math.min(0.75, G.shake + 0.28);
  dom.vignette.style.opacity = '1';
  clearTimeout(damageTimer);
  damageTimer = setTimeout(() => { dom.vignette.style.opacity = '0'; }, 120);
  playHurt();
  updateHUD();
  if (player.hp <= 0) {
    player.hp = 0;
    updateHUD();
    if (hooks.onPlayerDeath) hooks.onPlayerDeath();
  }
}
