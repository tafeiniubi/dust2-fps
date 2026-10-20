/* =========================================================================
   音效（WebAudio 实时合成）
   不加载任何音频文件：枪声用噪声 + 低通滤波，命中/受伤用振荡器。
   ========================================================================= */

let audioCtx = null;
let noiseBuf = null;

export function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    const len = Math.floor(audioCtx.sampleRate * 0.4);
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    audioCtx = null;
  }
}

function sfxNoise(vol, f0, f1, dur) {
  if (!audioCtx || !noiseBuf) return;
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

function sfxTone(freq, vol, dur, type, slideTo) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const playGunshot = () => { sfxNoise(0.34, 3200, 420, 0.16); sfxTone(128, 0.22, 0.12, 'sine', 48); };
/* AK-47：更低沉、更厚重，尾音更长 */
export const playAkShot = () => {
  sfxNoise(0.4, 2400, 260, 0.22);
  sfxTone(96, 0.3, 0.18, 'sine', 38);
  sfxTone(190, 0.12, 0.09, 'square', 90);
};
export const playEnemyShot = () => sfxNoise(0.13, 1900, 320, 0.12);
export const playHit = () => sfxTone(1650, 0.1, 0.06, 'square', 1150);
export const playHurt = () => { sfxTone(170, 0.22, 0.2, 'sawtooth', 85); sfxNoise(0.12, 900, 200, 0.16); };
export const playEmpty = () => sfxTone(950, 0.05, 0.035, 'square');
export const playReload = () => {
  sfxTone(560, 0.07, 0.05, 'square');
  setTimeout(() => sfxTone(760, 0.07, 0.05, 'square'), 380);
};
/* 小刀挥砍：破空声（噪声扫频） */
export const playKnifeSwing = () => {
  sfxNoise(0.16, 5200, 700, 0.16);
  sfxTone(420, 0.05, 0.1, 'sine', 180);
};
/* 刀刃命中：金属刮擦 + 闷响 */
export const playKnifeHit = () => {
  sfxNoise(0.22, 3600, 500, 0.13);
  sfxTone(880, 0.12, 0.09, 'square', 320);
};
/* 切枪：金属机匣碰撞 */
export const playSwitch = () => {
  sfxTone(320, 0.09, 0.05, 'square', 190);
  setTimeout(() => sfxTone(240, 0.07, 0.05, 'square', 150), 90);
};
