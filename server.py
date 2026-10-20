#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DUST STRIKE · 本地静态文件服务器（Python 版，仅用标准库）

用法：
    python server.py            # 默认 http://127.0.0.1:8080/
    python server.py 3000       # 指定端口
    python3 server.py 3000      # macOS / Linux

端口被占用时会自动尝试下一个端口（最多 +20），并打印最终访问地址。
"""

import errno
import functools
import os
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("HOST", "127.0.0.1")
ENTRY = "index.html"
MAX_TRIES = 20

BANNER_WIDTH = 46


def is_port_busy(exc):
    """判断是否为“端口已被占用”。

    Windows 上若端口被另一个独占绑定的进程占用，bind 可能返回
    WSAEACCES(10013) 而不是 EADDRINUSE(10048)，两者都要当作占用处理。
    """
    if exc.errno in (errno.EADDRINUSE, errno.EACCES):
        return True
    return getattr(exc, "winerror", None) in (10013, 10048)


class GameRequestHandler(SimpleHTTPRequestHandler):
    """在标准静态文件服务基础上：禁用缓存、禁用目录列表、精简日志。"""

    server_version = "DustStrikeHTTP/1.0"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        # 不暴露服务目录内容
        self.send_error(404, "Not Found")
        return None

    def log_message(self, fmt, *args):
        message = fmt % args
        sys.stdout.write("  " + message + "\n")
        sys.stdout.flush()

    def log_error(self, fmt, *args):
        # 404 等错误同样走精简日志
        self.log_message(fmt, *args)


def print_banner(port):
    line = "─" * BANNER_WIDTH
    print()
    print("  ┌" + line + "┐")
    print("  │  DUST STRIKE · 静态服务器 (Python)           │")
    print("  └" + line + "┘")
    print()
    print("  游戏地址 : http://{}:{}/".format(HOST, port))
    print("  服务目录 : {}".format(ROOT))
    print("  停止服务 : Ctrl + C")
    print()
    print("  提示：浏览器首次打开需要联网加载 Three.js CDN。")
    print()


def make_server(port):
    handler = functools.partial(GameRequestHandler, directory=ROOT)
    return ThreadingHTTPServer((HOST, port), handler)


def main():
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        return 0

    base_port = 8080
    for arg in sys.argv[1:]:
        if arg.isdigit():
            base_port = int(arg)
            break

    server = None
    port = base_port
    for attempt in range(MAX_TRIES + 1):
        try:
            server = make_server(port)
            break
        except OSError as exc:
            if is_port_busy(exc) and attempt < MAX_TRIES:
                print("  端口 {} 已被占用，尝试 {} …".format(port, port + 1))
                port += 1
                continue
            print()
            print("  启动失败：{}".format(exc))
            print("  可换一个端口后重试： python server.py 3000")
            print()
            return 1

    if server is None:
        print("  启动失败：连续尝试多个端口均被占用。")
        return 1

    print_banner(port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  服务已停止。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
