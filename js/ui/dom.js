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

  menuBtns: document.querySelector('#pauseScreen .menuBtns'),
  startBrief: $('startBrief'),
  diffGroup: $('diffGroup'),
  countGroup: $('countGroup'),
  setupHint: $('setupHint'),
  settingsBtn: $('settingsBtn'),
  keySettings: $('keySettings'),
  keyRows: $('keyRows'),
  resetKeysBtn: $('resetKeysBtn'),
  backToMenuBtn: $('backToMenuBtn'),
  ksTip: $('ksTip'),

  hpNum: $('hpNum'),
  hpBar: $('hpBar'),
  ammoNum: $('ammoNum'),
  ammoRes: $('ammoRes'),
  ammoCap: $('ammoCap'),
  weaponList: $('weaponList'),
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
