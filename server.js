#!/usr/bin/env node
/**
 * DUST STRIKE · 本地静态文件服务器（Node.js 版，零第三方依赖）
 *
 * 用法：
 *   node server.js            # 默认 http://127.0.0.1:8080/
 *   node server.js 3000       # 指定端口
 *   PORT=3000 node server.js  # 通过环境变量指定端口
 *
 * 端口被占用时会自动尝试下一个端口（最多 +20），并打印最终访问地址。
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const HOST = process.env.HOST || '127.0.0.1';
const BASE_PORT = Number(process.argv[2] || process.env.PORT || 8080);
const MAX_TRIES = 20;
const ENTRY = 'index.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** 将 URL 路径解析为磁盘路径，阻止目录穿越。返回 null 表示非法。 */
function resolveFilePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const relative = decoded.replace(/^\/+/, '');
  const full = path.resolve(ROOT, relative);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (full !== ROOT && !full.startsWith(rootPrefix)) return null;
  return full;
}

function sendText(res, status, text) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  });
  res.end(body);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err) {
      sendText(res, 404, `404 Not Found: ${req.url}`);
      return;
    }
    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, ENTRY);
      fs.stat(indexPath, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          sendText(res, 404, '404 Not Found（目录下没有 index.html）');
          return;
        }
        serveFile(req, res, indexPath);
      });
      return;
    }
    if (!stat.isFile()) {
      sendText(res, 404, '404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
    };

    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  });
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 Method Not Allowed');
    return;
  }

  let filePath;
  try {
    filePath = resolveFilePath(req.url || '/');
  } catch {
    filePath = null;
  }
  if (!filePath) {
    sendText(res, 403, '403 Forbidden');
    return;
  }

  const started = Date.now();
  res.on('finish', () => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    console.log(`  ${String(res.statusCode)}  ${req.method.padEnd(4)} ${url}  ${Date.now() - started}ms`);
  });

  serveFile(req, res, filePath);
}

function banner(port) {
  const line = '─'.repeat(46);
  console.log('');
  console.log(`  ┌${line}┐`);
  console.log('  │  DUST STRIKE · 静态服务器 (Node.js)          │');
  console.log(`  └${line}┘`);
  console.log('');
  console.log(`  游戏地址 : http://${HOST}:${port}/`);
  console.log(`  服务目录 : ${ROOT}`);
  console.log('  停止服务 : Ctrl + C');
  console.log('');
  console.log('  提示：浏览器首次打开需要联网加载 Three.js CDN。');
  console.log('');
}

function listen(port, attempt) {
  const server = http.createServer(handler);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_TRIES) {
      console.log(`  端口 ${port} 已被占用，尝试 ${port + 1} …`);
      setTimeout(() => listen(port + 1, attempt + 1), 60);
      return;
    }
    console.error('');
    console.error(`  启动失败：${err.message}`);
    console.error('  可换一个端口后重试： node server.js 3000');
    console.error('');
    process.exitCode = 1;
  });

  server.listen(port, HOST, () => {
    banner(port);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log('\n  服务已停止。');
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500);
    });
  }
}

listen(BASE_PORT, 0);
