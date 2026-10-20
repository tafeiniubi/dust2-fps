/* =========================================================================
   Three.js 加载器
   依次尝试官方 CDN（unpkg / jsdelivr / esm.sh），任一成功即返回模块。
   加载失败时在页面上给出明确提示，避免出现白屏。
   ========================================================================= */

const CDN_LIST = [
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://esm.sh/three@0.160.0',
];

let THREE = null;
for (const url of CDN_LIST) {
  try {
    THREE = await import(url);
    break;
  } catch (err) {
    console.warn('[DUST] CDN 加载失败:', url);
  }
}

const loadingEl = document.getElementById('loading');
if (!THREE) {
  if (loadingEl) {
    loadingEl.innerHTML = '<p style="letter-spacing:.1em">Three.js 加载失败，请检查网络连接后刷新页面。</p>';
  }
  throw new Error('Three.js failed to load');
}
if (loadingEl) loadingEl.remove();

export { THREE };
