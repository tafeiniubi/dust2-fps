/* =========================================================================
   渲染基础
   主场景、主相机、天空盒、灯光，以及独立的第一人称枪械场景。
   枪械用单独场景渲染，贴近墙面时不会穿模。
   ========================================================================= */

import { THREE } from '../core/three.js';
import { dom } from '../ui/dom.js';

export const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

export const scene = new THREE.Scene();

/* --------------------------------------------------------------- 天空盒
   用 Canvas 画一张黄昏沙漠天空，上下渐变 + 地平线辉光 + 云带，
   比纯色背景更有层次，同时体积为零。 */
function buildSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const ctx = c.getContext('2d');

  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, '#3f6c9e');
  grd.addColorStop(0.32, '#7fa5c4');
  grd.addColorStop(0.52, '#c8c2ad');
  grd.addColorStop(0.62, '#e8c68d');
  grd.addColorStop(0.70, '#d9a86a');
  grd.addColorStop(1.00, '#8a6a45');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 256);

  /* 云带：靠近地平线的一条条柔和横纹 */
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const y = 40 + Math.random() * 110;
    const h = 2 + Math.random() * 7;
    const a = 0.05 + Math.random() * 0.14;
    ctx.fillStyle = `rgba(255,248,232,${a})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 64, y, 20 + Math.random() * 34, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

const skyTex = buildSkyTexture();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(220, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })
);
sky.name = 'sky';
scene.add(sky);

/* 雾：贴近沙尘的暖色薄雾，远景自然褪色 */
scene.fog = new THREE.Fog(0xdcbf90, 42, 165);

export const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

/* --------------------------------------------------------------- 灯光
   主光偏暖（黄昏斜阳），补光偏冷（天光），让阴影面不至于死黑。 */
const hemi = new THREE.HemisphereLight(0xffeccc, 0x7d6448, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0cd, 3.1);
/* 低角度斜阳：影子更长，墙面层次更明显 */
sun.position.set(52, 40, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -58;
sun.shadow.camera.right = 58;
sun.shadow.camera.top = 58;
sun.shadow.camera.bottom = -58;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 180;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun);

/* 反向补光：模拟对面墙面的反射，消除纯黑死区 */
const bounce = new THREE.DirectionalLight(0xa8c4e0, 0.38);
bounce.position.set(-30, 22, -34);
scene.add(bounce);

/* 地面环境反射的暖色补光 */
const ambient = new THREE.AmbientLight(0xd8c19a, 0.22);
scene.add(ambient);

/* --------------------------------------------------------------- 枪械场景 */
export const gunScene = new THREE.Scene();
export const gunCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
gunScene.add(gunCamera);
gunScene.add(new THREE.AmbientLight(0xffffff, 1.35));

const gunLight = new THREE.DirectionalLight(0xffe9c4, 2.2);
gunLight.position.set(0.8, 1.4, 1.2);
gunScene.add(gunLight);

/* --------------------------------------------------------------- 自适应画质
   监测帧率：连续掉帧就降像素比与阴影分辨率，恢复后再逐步升回。 */
const quality = {
  level: 2,          // 2 = 高，1 = 中，0 = 低
  shadowSize: 2048,
  samples: [],
  cooldown: 0,
  locked: false,
};

function applyQuality(level) {
  if (quality.level === level) return;
  quality.level = level;
  const pr = level === 2 ? Math.min(window.devicePixelRatio || 1, 1.75)
    : level === 1 ? Math.min(window.devicePixelRatio || 1, 1.25)
      : 1;
  renderer.setPixelRatio(pr);
  const size = level === 2 ? 2048 : level === 1 ? 1024 : 512;
  if (size !== quality.shadowSize) {
    quality.shadowSize = size;
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  sun.castShadow = level > 0;
}

export function tuneQuality(dt) {
  if (quality.locked) return;
  quality.cooldown -= dt;
  if (quality.cooldown > 0) return;

  quality.samples.push(dt);
  if (quality.samples.length < 45) return;
  const avg = quality.samples.reduce((a, b) => a + b, 0) / quality.samples.length;
  quality.samples.length = 0;

  const fps = 1 / Math.max(1e-4, avg);
  if (fps < 42 && quality.level > 0) {
    applyQuality(quality.level - 1);
    quality.cooldown = 3;
  } else if (fps > 57 && quality.level < 2) {
    applyQuality(quality.level + 1);
    quality.cooldown = 6;
  } else {
    quality.cooldown = 1.5;
  }
}

/** 供自动化测试读取当前画质档位 */
export function getQualityLevel() {
  return quality.level;
}
