/* =========================================================================
   渲染基础
   主场景、主相机、灯光，以及独立的第一人称枪械场景。
   枪械用单独场景渲染，贴近墙面时不会穿模。
   ========================================================================= */

import { THREE } from '../core/three.js';
import { dom } from '../ui/dom.js';

export const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbccdd6);
scene.fog = new THREE.Fog(0xd9c49a, 36, 150);

export const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xfff4da, 0x8a6d48, 1.25);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0cc, 2.1);
sun.position.set(38, 62, 26);
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

export const gunScene = new THREE.Scene();
export const gunCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
gunScene.add(gunCamera);
gunScene.add(new THREE.AmbientLight(0xffffff, 1.35));

const gunLight = new THREE.DirectionalLight(0xffe9c4, 2.2);
gunLight.position.set(0.8, 1.4, 1.2);
gunScene.add(gunLight);
