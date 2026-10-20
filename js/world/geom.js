/* =========================================================================
   几何合并工具
   把许多小盒子合并成一个大网格：
   - 静态场景（建筑/木箱/斜坡）从几十个 draw call 降到 3~4 个
   - 敌人模型同理，部件少但形状完整
   合并后统一使用顶点色，材质只需要一份贴图。
   ========================================================================= */

import { THREE } from '../core/three.js';

/**
 * 合并若干 BufferGeometry。
 * 要求每个几何体带 position/normal/uv；缺 uv 会补零，缺 color 会补白。
 * 返回带 index 的单个几何体。
 */
export function mergeGeometries(geoms) {
  const list = geoms.filter((g) => g && g.getAttribute('position'));
  if (!list.length) return new THREE.BufferGeometry();

  let vCount = 0;
  let iCount = 0;
  const prepped = list.map((g) => {
    const geo = g.index ? g : g.toNonIndexed();
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const col = geo.getAttribute('color');
    vCount += p.count;
    iCount += geo.index ? geo.index.count : p.count;
    return { geo, p, n, uv, col };
  });

  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const color = new Float32Array(vCount * 3);
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

  let vo = 0;
  let io = 0;
  for (const { geo, p, n, uv: u, col: c } of prepped) {
    position.set(p.array.subarray(0, p.count * 3), vo * 3);
    if (n) normal.set(n.array.subarray(0, n.count * 3), vo * 3);
    if (u) uv.set(u.array.subarray(0, u.count * 2), vo * 2);
    if (c) color.set(c.array.subarray(0, c.count * 3), vo * 3);
    else color.fill(1, vo * 3, vo * 3 + p.count * 3);

    if (geo.index) {
      const ia = geo.index.array;
      for (let i = 0; i < ia.length; i++) index[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < p.count; i++) index[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * 生成一个带指定尺寸与颜色的盒子几何体（已烘焙到目标位置）。
 * 返回的几何体自带 color 属性，方便合并后用顶点色区分。
 */
export function boxAt(w, h, d, x, y, z, color, uvScale) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) scaleUv(g, uvScale);
  g.translate(x, y, z);
  applyColor(g, color);
  return g;
}

/** 按世界尺寸缩放 UV，避免大墙面纹理被拉伸 */
export function scaleUv(geo, sx, sy) {
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  }
  uv.needsUpdate = true;
  return geo;
}

/** 给几何体写入统一顶点色 */
export function applyColor(geo, color) {
  const p = geo.getAttribute('position');
  const c = new THREE.Color(color);
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 合并一个 Group 下的网格（按材质分组），返回合并后的几何体 */
export function mergeGroup(geoms) {
  return mergeGeometries(geoms);
}
