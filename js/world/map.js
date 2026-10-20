/* =========================================================================
   地图：de_dust2 简化版
   ---------------------------------------------------------------
   坐标约定：+x 向东、+z 向南，y 向上。
   可行走区域由 AREAS（小地图同源）描述，区域之间用实体建筑分隔：
     T 出生点 → 中路 / A 大通道 → A 包点、A 小道
     B 洞 → B 包点 → CT 出生点 → 中路
   墙体、木箱、矮墙全部登记为 AABB 碰撞体；斜坡用高度场处理。
   静态几何全部合并为少数几个网格，把 draw call 压到最低。
   ========================================================================= */

import { THREE } from '../core/three.js';
import { scene } from './scene.js';
import { MAT, TILE } from './textures.js';
import { boxAt, mergeGeometries, scaleUv, applyColor } from './geom.js';

export const colliders = [];
export const worldMeshes = [];
export const ramps = [];

/* 合并用的几何体收集器：按材质分组，最后统一生成网格 */
const buckets = new Map();

function bucket(mat) {
  if (!buckets.has(mat)) buckets.set(mat, []);
  return buckets.get(mat);
}

/** 登记一个轴对齐碰撞体 */
function addCollider(x1, z1, x2, z2, minY, maxY) {
  colliders.push({
    minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
    minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2),
    minY, maxY,
  });
}

/**
 * 一座建筑：主体 + 顶部压边，同时产生碰撞。
 * 几何体进入合并桶，不单独生成 Mesh。
 */
function addBuilding(x1, z1, x2, z2, h, mat, color, opts) {
  const w = x2 - x1, d = z2 - z1;
  const cx = x1 + w / 2, cz = z1 + d / 2;

  const body = new THREE.BoxGeometry(w, h, d);
  scaleUv(body, w / TILE.wall, h / TILE.wall);
  body.translate(cx, h / 2, cz);
  applyColor(body, color);
  bucket(mat).push(body);

  /* 顶部压边（比主体略大，做出檐口） */
  const cap = new THREE.BoxGeometry(w + 0.4, 0.32, d + 0.4);
  scaleUv(cap, (w + 0.4) / TILE.wall, 0.4 / TILE.wall);
  cap.translate(cx, h + 0.16, cz);
  applyColor(cap, 0xb59a6c);
  bucket(MAT.trim).push(cap);

  /* 底部基座：略深一圈，视觉上把墙"压"在地面上 */
  const base = new THREE.BoxGeometry(w + 0.24, 0.9, d + 0.24);
  scaleUv(base, (w + 0.24) / TILE.wall, 0.9 / TILE.wall);
  base.translate(cx, 0.45, cz);
  applyColor(base, 0x8a7248);
  bucket(MAT.trim).push(base);

  addCollider(x1, z1, x2, z2, 0, h);
  return { cx, cz, w, d, h };
}

/** 一个木箱（可堆叠） */
function addCrate(cx, cz, size, h, y0) {
  y0 = y0 || 0;
  const g = new THREE.BoxGeometry(size, h, size);
  scaleUv(g, size / TILE.crate, h / TILE.crate);
  g.translate(cx, y0 + h / 2, cz);
  applyColor(g, 0xffffff);
  bucket(MAT.crate).push(g);
  addCollider(cx - size / 2, cz - size / 2, cx + size / 2, cz + size / 2, y0, y0 + h);
}

/** 金属油桶：可作掩体，比木箱更矮 */
function addBarrel(cx, cz, y0) {
  y0 = y0 || 0;
  const r = 0.46, h = 1.24;
  const g = new THREE.CylinderGeometry(r, r, h, 14, 1);
  scaleUv(g, 1, 1);
  g.translate(cx, y0 + h / 2, cz);
  applyColor(g, 0xffffff);
  bucket(MAT.metal).push(g);
  addCollider(cx - r, cz - r, cx + r, cz + r, y0, y0 + h);
}

/** 沙袋掩体：矮而宽，可蹲下躲蔽 */
function addSandbags(cx, cz, len, ry) {
  ry = ry || 0;
  const h = 1.05;
  const g = new THREE.BoxGeometry(len, h, 0.85);
  scaleUv(g, len / TILE.sack, h / TILE.sack);
  g.rotateY(ry);
  g.translate(cx, h / 2, cz);
  applyColor(g, 0xffffff);
  bucket(MAT.sack).push(g);
  const hw = Math.abs(Math.cos(ry)) * len / 2 + Math.abs(Math.sin(ry)) * 0.43;
  const hd = Math.abs(Math.sin(ry)) * len / 2 + Math.abs(Math.cos(ry)) * 0.43;
  addCollider(cx - hw, cz - hd, cx + hw, cz + hd, 0, h);
}

/** 斜坡：北侧（z1）高、南侧（z2）低 */
function addRamp(x1, z1, x2, z2, h) {
  ramps.push({ x1, z1, x2, z2, h });
  addRampCollider(x1, z1, x2, z2, h);

  const pos = new Float32Array([
    x1, 0, z1, x2, h, z1, x2, 0, z1,   // 北侧立面
    x1, h, z1, x2, 0, z2, x2, h, z1,   // 斜面
    x1, h, z1, x1, 0, z2, x2, 0, z2,   // 斜面
    x1, 0, z1, x1, 0, z2, x1, h, z1,   // 西侧
    x2, 0, z1, x2, h, z1, x2, 0, z2,   // 东侧
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = (pos[i * 3] - x1) / TILE.ground;
    uv[i * 2 + 1] = (pos[i * 3 + 2] - z1) / TILE.ground;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  applyColor(geo, 0xffffff);
  bucket(MAT.ramp).push(geo);
}

/**
 * 斜坡的侧面挡墙：
 * 斜坡本体只有高度场，没有实体侧面，玩家可以从坡边走空。
 * 这里沿坡道两侧加一排与坡面同高的台阶块，把坡道"包"成一条真正的通道。
 */
function addRampCollider(x1, z1, x2, z2, h) {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const za = z1 + (z2 - z1) * t0;
    const zb = z1 + (z2 - z1) * t1;
    const hh = h * (1 - t0);
    if (hh < 0.08) continue;
    /* 两侧各放一条薄板，厚度 0.3 */
    addCollider(x1 - 0.3, za, x1, zb, 0, hh);
    addCollider(x2, za, x2 + 0.3, zb, 0, hh);
  }
}

/**
 * 门框 / 拱门：在通道口立两根柱子加一道横梁，视觉上像一道门。
 * axis='x' 表示门洞沿 X 方向展开（柱子分列在 x 两侧），'z' 则反之。
 */
function addArch(cx, cz, width, height, axis, opts) {
  opts = opts || {};
  const postW = opts.postW || 0.7;    // 柱子沿跨度方向的厚度
  const postD = opts.postD || 0.9;    // 柱子垂直跨度方向的厚度
  const half = width / 2;

  for (const s of [-1, 1]) {
    const px = axis === 'x' ? cx + half * s : cx;
    const pz = axis === 'x' ? cz : cz + half * s;
    const w = axis === 'x' ? postW : postD;
    const d = axis === 'x' ? postD : postW;
    const g = new THREE.BoxGeometry(w, height, d);
    scaleUv(g, w / TILE.wall, height / TILE.wall);
    g.translate(px, height / 2, pz);
    applyColor(g, 0xd8c096);
    bucket(MAT.wall).push(g);
    addCollider(px - w / 2, pz - d / 2, px + w / 2, pz + d / 2, 0, height);
  }

  /* 横梁 */
  const beamT = postD + 0.3;
  const bw = axis === 'x' ? width + postW + 0.5 : beamT;
  const bd = axis === 'x' ? beamT : width + postW + 0.5;
  const beam = new THREE.BoxGeometry(bw, 0.6, bd);
  scaleUv(beam, bw / TILE.wall, 0.6 / TILE.wall);
  beam.translate(cx, height + 0.22, cz);
  applyColor(beam, 0xb59a6c);
  bucket(MAT.trim).push(beam);

  /* 门楣上的铁牌 */
  if (opts.sign !== false) {
    const sw = axis === 'x' ? 1.6 : 0.09;
    const sd = axis === 'x' ? 0.09 : 1.6;
    const sign = new THREE.BoxGeometry(sw, 0.44, sd);
    scaleUv(sign, sw, 0.44);
    sign.translate(cx, height - 0.3, cz);
    applyColor(sign, 0x6a5a3c);
    bucket(MAT.metal).push(sign);
  }
}

/** 石头：低多边形圆石，边缘装饰，少数带碰撞 */
function addRock(cx, cz, r, h, solid) {
  const g = new THREE.CylinderGeometry(r * 0.85, r, h, 6, 1);
  scaleUv(g, 1, 1);
  g.rotateY(Math.random() * Math.PI);
  g.translate(cx, h / 2, cz);
  applyColor(g, 0xc0a781);
  bucket(MAT.hill).push(g);
  if (solid) addCollider(cx - r * 0.8, cz - r * 0.8, cx + r * 0.8, cz + r * 0.8, 0, h);
}

/* --------------------------------------------------------------- 地面 */
{
  const g = new THREE.PlaneGeometry(150, 150, 1, 1);
  scaleUv(g, 150 / TILE.ground, 150 / TILE.ground);
  g.rotateX(-Math.PI / 2);
  applyColor(g, 0xffffff);
  const ground = new THREE.Mesh(g, MAT.ground);
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  worldMeshes.push(ground);
}

/* --------------------------------------------------------------- 外围城墙（内墙面在 ±44） */
addBuilding(-46, -46, 46, -44, 8.4, MAT.wall, 0xf2e2c4);
addBuilding(-46, 44, 46, 46, 8.4, MAT.wall, 0xf2e2c4);
addBuilding(-46, -46, -44, 46, 8.4, MAT.wall, 0xf2e2c4);
addBuilding(44, -46, 46, 46, 8.4, MAT.wall, 0xf2e2c4);

/* --------------------------------------------------------------- 区域隔墙 */
// A 大通道西墙、A 小道两侧
addBuilding(10, -16, 24, 2, 6.6, MAT.wall, 0xffffff);
addBuilding(10, 2, 24, 16, 7.8, MAT.wallAlt, 0xffffff);
addBuilding(10, 16, 24, 28, 6.2, MAT.wall, 0xffffff);

// 中路西侧（T 出生点与中路之间）
addBuilding(-22, 4, -6, 16, 6.6, MAT.wallAlt, 0xffffff);
addBuilding(-22, 16, -6, 28, 7.6, MAT.wall, 0xffffff);

// 中路南段与 B 通道之间
addBuilding(-22, -26, -6, -16, 8.0, MAT.wall, 0xffffff);
addBuilding(-22, -16, -6, -6, 6.4, MAT.wallAlt, 0xffffff);

// B 洞西侧
addBuilding(-44, -26, -40, 8, 7.0, MAT.wall, 0xffffff);
addBuilding(-44, 8, -40, 44, 6.2, MAT.wallAlt, 0xffffff);

// A 大通道东侧
addBuilding(40, -28, 44, 0, 7.4, MAT.wall, 0xffffff);
addBuilding(40, 0, 44, 28, 6.4, MAT.wallAlt, 0xffffff);

/* --------------------------------------------------------------- 掩体：矮墙 / 沙袋 */
addBuilding(16, -33, 24, -32, 1.1, MAT.wall, 0x9c8256);
addBuilding(-32, -38, -24, -37, 1.1, MAT.wall, 0x9c8256);
addBuilding(4, 10, 9, 11, 1.05, MAT.wall, 0x9c8256);
addBuilding(-40, 22, -34, 23, 1.1, MAT.wall, 0x9c8256);

/* 沙袋：给 A 包点和 B 包点增加层次 */
addSandbags(20, -30, 3.2, 0);
addSandbags(30, -36, 2.6, Math.PI / 2);
addSandbags(-24, -36, 3.0, 0);
addSandbags(-34, -30, 2.6, Math.PI / 2);
addSandbags(0, 6, 2.8, Math.PI / 2);
addSandbags(-8, -12, 2.8, 0);

/* --------------------------------------------------------------- 掩体：木箱（部分堆叠） */
const CRATES = [
  [-2, 31, 2, 1.6, 0], [28, 30, 2, 1.6, 0], [28, 30, 1.5, 1.3, 1.6], [-16, 31, 2, 1.6, 0],
  [8, 20, 2, 1.7, 0], [8, 20, 1.5, 1.3, 1.7], [-4.8, 12, 2, 1.6, 0],
  [8, -12, 2, 1.6, 0], [-4.8, -16, 2, 1.6, 0],
  [38, 18, 2, 1.7, 0], [38, 18, 1.6, 1.3, 1.7], [26, 2, 2, 1.6, 0], [33, -14, 2, 1.7, 0],
  [12, -24, 2, 1.6, 0], [14, -38, 2, 1.7, 0], [16, -38, 2, 1.7, 0], [16, -38, 1.5, 1.3, 1.7],
  [30, -40, 2, 1.8, 0], [30, -40, 1.5, 1.4, 1.8], [38, -36, 2, 1.7, 0],
  [-38, -38, 2, 1.8, 0], [-38, -38, 1.5, 1.4, 1.8], [-24, -40, 2, 1.7, 0], [-30, -30, 2, 1.6, 0],
  [-38, 24, 2, 1.7, 0], [-24, -16, 2, 1.6, 0], [6, -40, 2, 1.7, 0], [-12, -32, 2, 1.6, 0],
  /* 补充的中路与通道掩体，让交火路线更有层次 */
  [-1, 20, 1.8, 1.5, 0], [3, -4, 1.8, 1.5, 0], [26, 12, 1.8, 1.5, 0], [34, -8, 1.8, 1.5, 0],
  [-30, 4, 1.8, 1.5, 0], [-34, -18, 1.8, 1.5, 0], [20, -20, 1.8, 1.5, 0], [36, -24, 1.8, 1.5, 0],
  [-14, 24, 1.8, 1.5, 0], [10, -34, 1.8, 1.5, 0],
];
for (const c of CRATES) addCrate(c[0], c[1], c[2], c[3], c[4]);

/* --------------------------------------------------------------- 油桶 */
addBarrel(24, -34);
addBarrel(25.3, -32.6);
addBarrel(-26, -30);
addBarrel(4, 14);
addBarrel(-2.4, -10);
addBarrel(34, -20);
addBarrel(18, 24);
addBarrel(30, 8);
addBarrel(31.4, 9.3);
addBarrel(-32, 12);
addBarrel(0, -20);
addBarrel(22, -12);
addBarrel(-18, -6);

/* --------------------------------------------------------------- 斜坡 */
addRamp(33, 6, 38, 12, 1.2);
addRamp(-38, 8, -33, 14, 1.2);
addRamp(3, -6, 8, 0, 1.0);
/* A 大通道入口坡道：给主通道一个入口高台 */
addRamp(30, 18, 38, 24, 0.9);
/* B 洞上坡 */
addRamp(-38, 14, -32, 20, 0.9);

/* --------------------------------------------------------------- 门框：区域之间的视觉地标
   柱子尽量贴着通道两侧的墙，中间留出足够宽的通行口。 */
addArch(32, 22, 14.0, 5.2, 'x');    // A 大通道北口
addArch(2, 24, 13.0, 5.2, 'x');     // 中路北口
addArch(-30, -26, 14.0, 4.8, 'x');  // B 洞南口
addArch(-2, -26, 12.0, 5.0, 'x');   // CT 出生点北口
addArch(16, -22, 10.0, 4.6, 'x');   // A 小道入口

/* --------------------------------------------------------------- 石头（边缘遮挡） */
const ROCKS = [
  [-40, 40, 1.6, 1.1, true], [-34, 42, 1.1, 0.8, false], [40, 40, 1.5, 1.0, true],
  [42, 34, 1.0, 0.7, false], [-42, -42, 1.4, 0.9, true], [40, -42, 1.3, 0.9, true],
  [-8, 42, 1.2, 0.8, false], [16, 42, 1.5, 1.0, true], [-30, 38, 1.0, 0.7, false],
  [42, -8, 1.1, 0.8, false], [-42, 4, 1.3, 0.9, true], [12, -42, 1.2, 0.8, false],
];
for (const r of ROCKS) addRock(r[0], r[1], r[2], r[3], r[4]);

/* --------------------------------------------------------------- 生成合并网格 */
function buildMerged() {
  for (const [mat, geoms] of buckets) {
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'static-' + (mat.name || 'batch');
    scene.add(mesh);
    worldMeshes.push(mesh);
    for (const g of geoms) g.dispose();
  }
  buckets.clear();
}
buildMerged();

/* --------------------------------------------------------------- 场景装饰（非碰撞） */
function addDecoration() {
  /* 远景山丘：给地平线一点起伏，避免天空与地面直接相接的呆板感 */
  const hillGeos = [];
  const hills = [
    [-70, -78, 26, 9], [-18, -92, 34, 12], [46, -74, 30, 10],
    [82, -30, 26, 8], [-88, 14, 30, 10], [24, 86, 28, 9], [-40, 88, 32, 11],
  ];
  for (const [x, z, r, h] of hills) {
    const g = new THREE.ConeGeometry(r, h, 7, 1);
    g.translate(x, h / 2 - 1, z);
    applyColor(g, 0xb59a72);
    hillGeos.push(g);
  }
  const hills2 = [];
  for (const [x, z, r, h] of hills) {
    const g = new THREE.ConeGeometry(r * 0.72, h * 0.7, 6, 1);
    g.translate(x + r * 0.4, h * 0.35 - 1, z - r * 0.3);
    applyColor(g, 0xc4ab84);
    hills2.push(g);
  }
  const hillMesh = new THREE.Mesh(mergeGeometries(hillGeos.concat(hills2)), MAT.hill);
  hillMesh.name = 'hills';
  scene.add(hillMesh);

  /* 棕榈树：给 A 大通道和 T 出生点加热带感 */
  const trunkGeos = [];
  const leafGeos = [];
  const palms = [
    [36, 22], [28, 26], [40, -8], [-36, 36], [-20, 42], [14, 34],
    [-40, -20], [2, -38], [40, 38], [-8, -40], [22, -40], [-30, -44],
  ];
  for (const [x, z] of palms) {
    const h = 3.6 + Math.random() * 2.2;
    const t = new THREE.CylinderGeometry(0.13, 0.22, h, 6, 1);
    t.translate(x, h / 2, z);
    applyColor(t, 0x8a6a44);
    trunkGeos.push(t);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const leaf = new THREE.ConeGeometry(0.42, 2.3, 4, 1);
      leaf.rotateZ(Math.PI * 0.5 - 0.5);
      leaf.rotateY(a);
      leaf.translate(x + Math.cos(a) * 0.85, h - 0.15, z + Math.sin(a) * 0.85);
      applyColor(leaf, i % 2 ? 0x4e6b35 : 0x5f7d40);
      leafGeos.push(leaf);
    }
  }
  const palmTrunks = new THREE.Mesh(mergeGeometries(trunkGeos), MAT.trim);
  palmTrunks.name = 'palm-trunks';
  scene.add(palmTrunks);
  const palmLeaves = new THREE.Mesh(mergeGeometries(leafGeos), MAT.leaf);
  palmLeaves.name = 'palm-leaves';
  scene.add(palmLeaves);

  /* 桶阵与集装箱，增加掩体层次 */
  const deco = [];
  const containers = [
    [-30, 40, 4.2, 2.4, 2.6], [30, -44, 3.4, 2.4, 2.6], [-42, 30, 3.0, 2.4, 2.6],
  ];
  for (const [x, z, w, h, d] of containers) {
    const g = new THREE.BoxGeometry(w, h, d);
    scaleUv(g, w / 3, h / 3);
    g.translate(x, h / 2, z);
    applyColor(g, 0x8a6a4a);
    deco.push(g);
  }
  const decoMesh = new THREE.Mesh(mergeGeometries(deco), MAT.crate);
  decoMesh.name = 'containers';
  decoMesh.castShadow = true;
  decoMesh.receiveShadow = true;
  scene.add(decoMesh);
}
addDecoration();

/* --------------------------------------------------------------- 地形查询 */
/**
 * 返回 (x,z) 处可站立的地面高度。
 * footY 用于判断能否直接站上矮掩体（落差过大则不算）。
 */
export function groundHeightAt(x, z, feetY) {
  let g = 0;
  for (const r of ramps) {
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
      const t = (r.z2 - z) / (r.z2 - r.z1);
      if (t > 0) g = Math.max(g, r.h * Math.min(1, t));
    }
  }
  for (const c of colliders) {
    if (c.maxY > 3) continue; // 只考虑可站立的小型掩体
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) {
      if (c.maxY <= feetY + 0.58) g = Math.max(g, c.maxY);
    }
  }
  return g;
}

/**
 * 圆（玩家/敌人）与 AABB 碰撞体分离。
 * 迭代两次，处理夹角同时压到两面墙的情况。
 */
export function resolveCollision(pos, radius, feetY, height) {
  for (let it = 0; it < 2; it++) {
    for (const c of colliders) {
      if (feetY + height <= c.minY + 0.001) continue;
      if (feetY >= c.maxY - 0.001) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        const l = pos.x - c.minX, r = c.maxX - pos.x;
        const n = pos.z - c.minZ, f = c.maxZ - pos.z;
        const m = Math.min(l, r, n, f);
        if (m === l) pos.x = c.minX - radius;
        else if (m === r) pos.x = c.maxX + radius;
        else if (m === n) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

/* --------------------------------------------------------------- 可行走区域（小地图同源） */
export const AREAS = [
  [-40, 28, 44, 44],     // T 出生点
  [-6, -28, 10, 28],     // 中路
  [24, -28, 40, 28],     // A 大通道
  [10, -44, 44, -28],    // A 包点
  [10, -28, 24, -16],    // A 小道
  [-40, -26, -22, 28],   // B 洞
  [-44, -44, -16, -26],  // B 包点
  [-16, -44, 10, -26],   // CT 出生点
  [-22, -6, -6, 4],      // B 通道
  [-44, -6, -22, 4],     // B 通道北段（连接 B 洞与中路）
];

/** 区域名称：小地图标注用 */
export const AREA_NAMES = {
  'T 出生点': [-40, 28, 44, 44],
  '中路': [-6, -28, 10, 28],
  'A 大通道': [24, -28, 40, 28],
  'A 包点': [10, -44, 44, -28],
  'A 小道': [10, -28, 24, -16],
  'B 洞': [-40, -26, -22, 28],
  'B 包点': [-44, -44, -16, -26],
  'CT 出生点': [-16, -44, 10, -26],
  'B 通道': [-22, -6, -6, 4],
};
