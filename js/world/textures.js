/* =========================================================================
   程序化贴图与材质
   用 Canvas 现场绘制沙地、墙面、木箱纹理，不依赖任何外部图片资源。
   ========================================================================= */

import { THREE } from '../core/three.js';

/** 画一张可平铺的 Canvas 贴图 */
export function makeCanvasTexture(size, painter, rx, ry) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (rx || ry) tex.repeat.set(rx || 1, ry || 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const sandTex = makeCanvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#d7ba87';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 7000; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = Math.random() * 1.9 + 0.3;
    ctx.fillStyle = i % 2 ? 'rgba(255,242,208,0.10)' : 'rgba(112,86,50,0.10)';
    ctx.fillRect(x, y, r, r);
  }
  ctx.strokeStyle = 'rgba(125,98,60,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 5);
    ctx.stroke();
  }
}, 26, 26);

const wallTex = makeCanvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 1500; i++) {
    const g = 210 + Math.random() * 40;
    ctx.fillStyle = `rgba(${g},${g},${g},0.55)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
  }
  ctx.fillStyle = 'rgba(60,50,35,0.10)';
  for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 1.5);
  for (let x = 0; x < s; x += 42) ctx.fillRect(x, 0, 1.5, s);
}, 3, 2);

const crateTex = makeCanvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#c79a62';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(92,62,32,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, s - 10, s - 10);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(7, 7); ctx.lineTo(s - 7, s - 7);
  ctx.moveTo(s - 7, 7); ctx.lineTo(7, s - 7);
  ctx.stroke();
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(105,72,38,0.18)';
    ctx.fillRect(Math.random() * s, Math.random() * s, 14, 1.4);
  }
}, 1, 1);

export const MAT = {
  ground: new THREE.MeshLambertMaterial({ map: sandTex }),
  building: new THREE.MeshLambertMaterial({ color: 0xcfb17d, map: wallTex }),
  building2: new THREE.MeshLambertMaterial({ color: 0xc6a874, map: wallTex }),
  trim: new THREE.MeshLambertMaterial({ color: 0xa9885b }),
  crate: new THREE.MeshLambertMaterial({ color: 0xffffff, map: crateTex }),
  lowCover: new THREE.MeshLambertMaterial({ color: 0xb99b66 }),
  ramp: new THREE.MeshLambertMaterial({ color: 0xc8a970, side: THREE.DoubleSide }),
};

export const crateEdgeMat = new THREE.LineBasicMaterial({ color: 0x5c4023, transparent: true, opacity: 0.75 });
