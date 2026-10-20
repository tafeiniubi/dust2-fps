/* =========================================================================
   DOM 引用
   页面结构见 index.html；此处集中查询，避免各模块重复 getElementById。
   ========================================================================= */

const $ = (id) => document.getElementById(id);

export const dom = {
  canvas: $('game'),

  hud: $('hud'),
  startScreen: $('startScreen'),
  endScreen: $('endScreen'),
  pauseScreen: $('pauseScreen'),

  startBtn: $('startBtn'),
  restartBtn: $('restartBtn'),
  resumeBtn: $('resumeBtn'),
  restartPauseBtn: $('restartPauseBtn'),
  quitBtn: $('quitBtn'),

  hpNum: $('hpNum'),
  hpBar: $('hpBar'),
  ammoNum: $('ammoNum'),
  killCount: $('killCount'),
  remaining: $('remaining'),
  hitmarker: $('hitmarker'),
  killfeed: $('killfeed'),
  vignette: $('vignette'),
  flash: $('flash'),
  crosshair: $('crosshair'),
  minimap: $('minimap'),
  hintBar: $('hintBar'),

  endTitle: $('endTitle'),
  endEyebrow: $('endEyebrow'),
  endDesc: $('endDesc'),
  endKills: $('endKills'),
  endTime: $('endTime'),
  endAccuracy: $('endAccuracy'),
};
