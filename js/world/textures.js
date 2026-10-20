/* =========================================================================
   程序化贴图与材质
   用 Canvas 现场绘制沙地、墙面、木箱纹理，不依赖任何外部图片资源。
   贴图统一按「世界尺寸」平铺（每 TILE 个世界单位重复一次），
   这样无论盒子多大，颗粒感都保持一致。
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

/** 在画布上撒细密颗粒（沙土 / 水泥通用的底噪） */
function grain(ctx, s, count, light, dark, sizeMin, sizeMax) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const r = sizeMin + Math.random() * (sizeMax - sizeMin);
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fillRect(x, y, r, r);
  }
}

/* --------------------------------------------------------------- 沙地 */
const sandTex = makeCanvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#d6b783';
  ctx.fillRect(0, 0, s, s);

  /* 大块色斑，制造沙土的深浅起伏 */
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 40 + Math.random() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    g.addColorStop(0, dark ? 'rgba(120,94,56,0.16)' : 'rgba(255,238,196,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* 风纹：横向的浅弧线 */
  ctx.strokeStyle = 'rgba(140,110,66,0.13)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * 9);
    }
    ctx.stroke();
  }

  grain(ctx, s, 9000, 'rgba(255,243,214,0.11)', 'rgba(112,86,50,0.11)', 0.4, 2.2);

  /* 小石子 */
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 0.7 + Math.random() * 1.7;
    ctx.fillStyle = 'rgba(88,70,44,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
});

/* --------------------------------------------------------------- 墙面（土坯 / 砂岩块） */
const wallTex = makeCanvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#e8dcc4';
  ctx.fillRect(0, 0, s, s);

  /* 横向砖缝，砖高约 s/4 */
  const rows = 4;
  const bh = s / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * bh;
    const offset = (r % 2) * (s / 6);
    for (let c = -1; c < 3; c++) {
      const x = c * (s / 3) + offset;
      const bw = s / 3;
      /* 每块砖的明度略有差别 */
      const v = 0.86 + Math.random() * 0.16;
      ctx.fillStyle = `rgba(${Math.round(232 * v)},${Math.round(219 * v)},${Math.round(191 * v)},1)`;
      ctx.fillRect(x + 1.6, y + 1.6, bw - 3.2, bh - 3.2);
      /* 砖块下沿阴影 */
      ctx.fillStyle = 'rgba(120,96,58,0.20)';
      ctx.fillRect(x + 1.6, y + bh - 4.2, bw - 3.2, 2.6);
      /* 上沿高光 */
      ctx.fillStyle = 'rgba(255,250,232,0.30)';
      ctx.fillRect(x + 1.6, y + 1.6, bw - 3.2, 1.6);
    }
  }

  /* 斑驳与裂纹 */
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 22;
    ctx.fillStyle = Math.random() < 0.55 ? 'rgba(150,120,78,0.10)' : 'rgba(255,250,235,0.10)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,96,58,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (Math.random() - 0.5) * 26;
      y += (Math.random() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, s, 4200, 'rgba(255,250,236,0.10)', 'rgba(120,96,58,0.10)', 0.4, 1.4);
});

/* --------------------------------------------------------------- 木箱 */
const crateTex = makeCanvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#c99b60';
  ctx.fillRect(0, 0, s, s);

  /* 竖向木板 */
  const planks = 4;
  const pw = s / planks;
  for (let i = 0; i < planks; i++) {
    const v = 0.9 + Math.random() * 0.2;
    ctx.fillStyle = `rgba(${Math.round(201 * v)},${Math.round(155 * v)},${Math.round(96 * v)},1)`;
    ctx.fillRect(i * pw + 1, 0, pw - 2, s);
    /* 木纹 */
    ctx.strokeStyle = 'rgba(122,86,44,0.16)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const x = i * pw + 2 + Math.random() * (pw - 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + k) * 1.6, y);
      ctx.stroke();
    }
  }

  /* 外框铁边 */
  ctx.strokeStyle = 'rgba(96,64,32,0.55)';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, s - 6, s - 6);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, 8); ctx.lineTo(s - 8, s - 8);
  ctx.moveTo(s - 8, 8); ctx.lineTo(8, s - 8);
  ctx.stroke();

  grain(ctx, s, 1400, 'rgba(255,232,190,0.10)', 'rgba(96,66,34,0.12)', 0.4, 1.6);
});

/* --------------------------------------------------------------- 金属桶 */
const metalTex = makeCanvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#6f7a63';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(40,46,38,0.5)';
    ctx.fillRect(0, i * (s / 5), s, 5);
    ctx.fillStyle = 'rgba(190,200,175,0.18)';
    ctx.fillRect(0, i * (s / 5) + 5, s, 3);
  }
  grain(ctx, s, 2200, 'rgba(220,230,205,0.10)', 'rgba(30,34,28,0.16)', 0.4, 2.0);
  /* 锈迹 */
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(140,84,40,0.28)');
    g.addColorStop(1, 'rgba(140,84,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
});

/* --------------------------------------------------------------- 沙袋 */
const sackTex = makeCanvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#b39a68';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 16;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(94,76,44,0.20)' : 'rgba(226,206,164,0.20)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, s, 2600, 'rgba(240,224,186,0.10)', 'rgba(88,72,42,0.12)', 0.4, 1.8);
});

/* --------------------------------------------------------------- 材质表
   统一使用 MeshStandardMaterial + 顶点色：合并后的网格靠顶点色区分，
   贴图只负责细节，材质数量保持在个位数。 */

const std = (map, opts) => new THREE.MeshStandardMaterial({
  map,
  roughness: 0.95,
  metalness: 0.0,
  vertexColors: true,
  ...opts,
});

export const MAT = {
  /* 地面：沙地，8 世界单位一个平铺周期 */
  ground: std(sandTex, { color: 0xe3c188 }),
  /* 墙体：砂岩块，4 世界单位一个平铺周期 */
  wall: std(wallTex, { color: 0xd2b47e }),
  wallAlt: std(wallTex, { color: 0xc7a97b }),
  /* 木箱：1 世界单位一个平铺周期 */
  crate: std(crateTex),
  /* 金属桶 */
  metal: std(metalTex, { roughness: 0.6, metalness: 0.25 }),
  /* 沙袋掩体 */
  sack: std(sackTex),
  /* 斜坡与沙地同源 */
  ramp: std(sandTex, { color: 0xe8c894 }),
  /* 压边 / 装饰条 / 树干 */
  trim: std(null, { color: 0xffffff, roughness: 0.85 }),
  /* 棕榈叶 */
  leaf: std(null, { color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
  /* 远景山丘（不参与阴影，纯粹做远景） */
  hill: std(null, { color: 0xffffff, roughness: 1.0, flatShading: true }),
  /* 深色（门洞、阴影内壁、轮胎） */
  dark: std(null, { color: 0xffffff, roughness: 0.98 }),
};

/** 贴图平铺周期（世界单位），配合 geom.scaleUv 使用 */
export const TILE = {
  ground: 8,
  wall: 4,
  crate: 1,
  metal: 1,
  sack: 1.2,
};
