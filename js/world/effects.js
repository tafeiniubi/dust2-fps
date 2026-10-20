/* =========================================================================
   战斗特效
   曳光弹、命中碎屑、血雾、弹孔。

   性能要点：
   - 曳光弹与粒子使用对象池，射击时不再 new 几何体/材质
   - 粒子共用一份几何体与两种材质（碎屑 / 血雾），靠 scale 区分
   - 弹孔材质共享，网格池上限 60
   ========================================================================= */

import { THREE } from '../core/three.js';
import { scene } from './scene.js';
import { makeCanvasTexture } from './textures.js';

const effects = [];

/* --------------------------------------------------------------- 共享资源 */
const particleGeo = new THREE.BoxGeometry(1, 1, 1);

const debrisMat = new THREE.MeshBasicMaterial({ color: 0xcfb083, transparent: true });
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8f1f14, transparent: true });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

/* --------------------------------------------------------------- 曳光弹池 */
const TRACER_POOL = 24;
const tracerPool = [];
const tracerActive = [];

function makeTracer() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  return line;
}
for (let i = 0; i < TRACER_POOL; i++) tracerPool.push(makeTracer());

export function spawnTracer(from, to, color, life) {
  life = life || 0.07;
  let line = tracerPool.pop();
  if (!line) {
    /* 池满：复用最老的一条 */
    const oldest = tracerActive.shift();
    if (!oldest) return;
    line = oldest.line;
  }
  const pos = line.geometry.getAttribute('position');
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  line.geometry.computeBoundingSphere();
  line.material.color.setHex(color);
  line.material.opacity = 0.85;
  line.visible = true;
  tracerActive.push({ line, life, maxLife: life });
}

/* --------------------------------------------------------------- 粒子池 */
const PARTICLE_POOL = 160;
const particlePool = [];

function makeParticle() {
  const m = new THREE.Mesh(particleGeo, debrisMat);
  m.visible = false;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
for (let i = 0; i < PARTICLE_POOL; i++) particlePool.push(makeParticle());

export function spawnParticles(pos, color, count, spread, size, life, gravity, kind) {
  const mat = kind === 'blood' ? bloodMat : kind === 'spark' ? sparkMat : debrisMat;
  for (let i = 0; i < count; i++) {
    let m = particlePool.pop();
    if (!m) {
      /* 池满：回收最早的一个 */
      let oldest = null;
      for (let k = effects.length - 1; k >= 0; k--) {
        if (effects[k].type === 'particle') { oldest = effects[k]; break; }
      }
      if (!oldest) return;
      m = oldest.mesh;
      effects.splice(effects.indexOf(oldest), 1);
    }
    m.material = mat;
    m.position.copy(pos);
    m.scale.setScalar(size * (0.55 + Math.random() * 0.9));
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.visible = true;
    effects.push({
      type: 'particle', mesh: m, life: life * (0.6 + Math.random() * 0.7), maxLife: life,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread + spread * 0.35,
        (Math.random() - 0.5) * spread
      ),
      gravity,
    });
  }
}

export function spawnImpact(point, normal) {
  spawnParticles(point.clone().addScaledVector(normal, 0.05), 0xcfb083, 7, 2.4, 0.06, 0.45, 14, 'debris');
  spawnParticles(point.clone().addScaledVector(normal, 0.04), 0xffd27a, 3, 3.0, 0.035, 0.22, 6, 'spark');
}

export function spawnBlood(point, head) {
  spawnParticles(point, 0x8f1f14, head ? 14 : 8, 2.6, 0.075, 0.5, 13, 'blood');
}

/* --------------------------------------------------------------- 弹孔 */
const holeTex = makeCanvasTexture(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(18,14,10,0.95)');
  g.addColorStop(0.45, 'rgba(30,24,16,0.8)');
  g.addColorStop(1, 'rgba(40,32,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});
const holeMat = new THREE.MeshBasicMaterial({
  map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
});

const bulletHoles = [];
const HOLE_MAX = 60;
const holeGeo = new THREE.PlaneGeometry(0.15, 0.15);
const normalMatrix = new THREE.Matrix3();

export function addBulletHole(hit) {
  if (!hit.face) return;
  const n = hit.face.normal.clone()
    .applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
    .normalize();
  let m = bulletHoles.find((x) => !x.visible);
  if (!m) {
    if (bulletHoles.length >= HOLE_MAX) {
      /* 池满：回收最早的弹孔 */
      m = bulletHoles.shift();
    } else {
      m = new THREE.Mesh(holeGeo, holeMat);
      scene.add(m);
    }
    bulletHoles.push(m);
  }
  m.position.copy(hit.point).addScaledVector(n, 0.012);
  m.lookAt(hit.point.clone().add(n));
  m.visible = true;
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    if (e.life <= 0) {
      e.mesh.visible = false;
      if (e.type === 'particle') particlePool.push(e.mesh);
      effects.splice(i, 1);
      continue;
    }
    if (e.type === 'particle') {
      e.vel.y -= e.gravity * dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.material.opacity = Math.min(1, e.life / e.maxLife);
      e.mesh.rotation.x += dt * 4;
      e.mesh.rotation.y += dt * 3;
    }
  }

  for (let i = tracerActive.length - 1; i >= 0; i--) {
    const t = tracerActive[i];
    t.life -= dt;
    if (t.life <= 0) {
      t.line.visible = false;
      tracerPool.push(t.line);
      tracerActive.splice(i, 1);
      continue;
    }
    t.line.material.opacity = (t.life / t.maxLife) * 0.85;
  }
}

/** 清空所有特效（重开一局时调用） */
export function clearEffects() {
  for (const e of effects) {
    e.mesh.visible = false;
    if (e.type === 'particle') particlePool.push(e.mesh);
  }
  effects.length = 0;
  for (const t of tracerActive) {
    t.line.visible = false;
    tracerPool.push(t.line);
  }
  tracerActive.length = 0;
  for (const h of bulletHoles) h.visible = false;
}
