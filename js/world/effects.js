/* =========================================================================
   战斗特效
   曳光弹、命中碎屑、血雾、弹孔。所有临时对象都会在生命周期结束后释放。
   ========================================================================= */

import { THREE } from '../core/three.js';
import { scene } from './scene.js';
import { makeCanvasTexture } from './textures.js';

const effects = [];
const bulletHoles = [];
const particleGeo = new THREE.BoxGeometry(1, 1, 1);

export function spawnTracer(from, to, color, life) {
  life = life || 0.07;
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  effects.push({ type: 'tracer', mesh: line, life, maxLife: life });
}

export function spawnParticles(pos, color, count, spread, size, life, gravity) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const m = new THREE.Mesh(particleGeo, mat);
    m.position.copy(pos);
    m.scale.setScalar(size * (0.55 + Math.random() * 0.9));
    scene.add(m);
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
  spawnParticles(point.clone().addScaledVector(normal, 0.05), 0xcfb083, 7, 2.4, 0.06, 0.45, 14);
}

export function spawnBlood(point, head) {
  spawnParticles(point, 0x8f1f14, head ? 14 : 8, 2.6, 0.075, 0.5, 13);
}

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

export function addBulletHole(hit) {
  if (!hit.face) return;
  const n = hit.face.normal.clone()
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), holeMat.clone());
  m.position.copy(hit.point).addScaledVector(n, 0.012);
  m.lookAt(hit.point.clone().add(n));
  scene.add(m);
  bulletHoles.push(m);
  if (bulletHoles.length > 45) {
    const old = bulletHoles.shift();
    scene.remove(old);
    old.geometry.dispose();
    old.material.dispose();
  }
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    if (e.life <= 0) {
      scene.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      if (e.mesh.material) e.mesh.material.dispose();
      effects.splice(i, 1);
      continue;
    }
    if (e.type === 'tracer') {
      e.mesh.material.opacity = (e.life / e.maxLife) * 0.85;
    } else if (e.type === 'particle') {
      e.vel.y -= e.gravity * dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.material.opacity = Math.min(1, e.life / e.maxLife);
      e.mesh.rotation.x += dt * 4;
      e.mesh.rotation.y += dt * 3;
    }
  }
}
