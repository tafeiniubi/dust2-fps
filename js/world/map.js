/* =========================================================================
   地图：de_dust2 简化版
   ---------------------------------------------------------------
   坐标约定：+x 向东、+z 向南，y 向上。
   可行走区域由 AREAS（小地图同源）描述，区域之间用实体建筑分隔：
     T 出生点 → 中路 / A 大通道 → A 包点、A 小道
     B 洞 → B 包点 → CT 出生点 → 中路
   墙体、木箱、矮墙全部登记为 AABB 碰撞体；斜坡用高度场处理。
   ========================================================================= */

import { THREE } from '../core/three.js';
import { scene } from './scene.js';
import { MAT, crateEdgeMat } from './textures.js';

export const colliders = [];
export const worldMeshes = [];
export const ramps = [];

/** 登记一个轴对齐碰撞体 */
function addCollider(x1, z1, x2, z2, minY, maxY) {
  colliders.push({
    minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
    minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2),
    minY, maxY,
  });
}

/** 一座建筑：盒子 + 顶部压边，同时产生碰撞 */
function addBuilding(x1, z1, x2, z2, h, mat) {
  const w = x2 - x1, d = z2 - z1;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x1 + w / 2, h / 2, z1 + d / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  worldMeshes.push(mesh);
  addCollider(x1, z1, x2, z2, 0, h);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.32, d + 0.4), MAT.trim);
  cap.position.set(mesh.position.x, h + 0.16, mesh.position.z);
  cap.castShadow = true;
  cap.receiveShadow = true;
  scene.add(cap);
  worldMeshes.push(cap);
  return mesh;
}

/** 一个木箱（可堆叠） */
function addCrate(cx, cz, size, h, y0) {
  y0 = y0 || 0;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), MAT.crate);
  mesh.position.set(cx, y0 + h / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), crateEdgeMat);
  mesh.add(edges);
  scene.add(mesh);
  worldMeshes.push(mesh);
  addCollider(cx - size / 2, cz - size / 2, cx + size / 2, cz + size / 2, y0, y0 + h);
}

/** 斜坡：北侧（z1）高、南侧（z2）低 */
function addRamp(x1, z1, x2, z2, h) {
  ramps.push({ x1, z1, x2, z2, h });
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
  const mesh = new THREE.Mesh(geo, MAT.ramp);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  worldMeshes.push(mesh);
}

/* --------------------------------------------------------------- 地面 */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), MAT.ground);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
worldMeshes.push(ground);

/* --------------------------------------------------------------- 外围城墙（内墙面在 ±44） */
addBuilding(-46, -46, 46, -44, 8.4, MAT.building2);
addBuilding(-46, 44, 46, 46, 8.4, MAT.building2);
addBuilding(-46, -46, -44, 46, 8.4, MAT.building2);
addBuilding(44, -46, 46, 46, 8.4, MAT.building2);

/* --------------------------------------------------------------- 区域隔墙 */
// A 大通道西墙、A 小道两侧
addBuilding(10, -16, 24, 2, 6.6, MAT.building);
addBuilding(10, 2, 24, 16, 7.8, MAT.building2);
addBuilding(10, 16, 24, 28, 6.2, MAT.building);

// 中路西侧（T 出生点与中路之间）
addBuilding(-22, 4, -6, 16, 6.6, MAT.building2);
addBuilding(-22, 16, -6, 28, 7.6, MAT.building);

// 中路南段与 B 通道之间
addBuilding(-22, -26, -6, -16, 8.0, MAT.building);
addBuilding(-22, -16, -6, -6, 6.4, MAT.building2);

// B 洞西侧
addBuilding(-44, -26, -40, 8, 7.0, MAT.building);
addBuilding(-44, 8, -40, 44, 6.2, MAT.building2);

// A 大通道东侧
addBuilding(40, -28, 44, 0, 7.4, MAT.building);
addBuilding(40, 0, 44, 28, 6.4, MAT.building2);

/* --------------------------------------------------------------- 掩体：矮墙 / 沙袋 */
addBuilding(16, -33, 24, -32, 1.1, MAT.lowCover);
addBuilding(-32, -38, -24, -37, 1.1, MAT.lowCover);
addBuilding(4, 10, 9, 11, 1.05, MAT.lowCover);
addBuilding(-40, 22, -34, 23, 1.1, MAT.lowCover);

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
];
for (const c of CRATES) addCrate(c[0], c[1], c[2], c[3], c[4]);

/* --------------------------------------------------------------- 斜坡 */
addRamp(33, 6, 38, 12, 1.2);
addRamp(-38, 8, -33, 14, 1.2);
addRamp(3, -6, 8, 0, 1.0);

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
];
