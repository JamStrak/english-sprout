"""Hidden, loopback-only preview launcher for the built English Sprout app.

Ordinary use: double-click 启动英语小芽.vbs. No third-party Python packages.
"""

from __future__ import annotations

import ctypes
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.error
import urllib.parse
import urllib.request
import webbrowser


APP_ID = "english-sprout"
HEALTH_PATH = "/__english_sprout_health"
HOST = "127.0.0.1"
PORTS = range(24736, 24747)
ROOT = Path(__file__).resolve().parent


class LaunchError(Exception):
    """An actionable, user-facing startup error."""


def project_identity(root: Path) -> str:
    canonical = os.path.normcase(str(root.resolve()))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]


def expected_health(root: Path) -> dict:
    return {"app": APP_ID, "protocol": 1, "project": project_identity(root)}


def find_existing(root: Path, ports=PORTS, timeout=0.15) -> int | None:
    # Ignore system proxies: local service discovery must never leave this PC.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    expected = expected_health(root)
    for port in ports:
        try:
            with opener.open(f"http://{HOST}:{port}{HEALTH_PATH}", timeout=timeout) as response:
                if response.status == 200 and json.loads(response.read(4096)) == expected:
                    return port
        except (OSError, ValueError, urllib.error.URLError):
            continue
    return None


class PreviewServer(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR can bind a port owned by another server.
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        import socket

        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_handler(root: Path):
    dist = (root / "dist").resolve()
    identity = expected_health(root)

    class Handler(BaseHTTPRequestHandler):
        server_version = "EnglishSprout"
        sys_version = ""

        def log_message(self, format, *args):
            # pythonw has no console; routine requests need no personal-data logs.
            pass

        def do_GET(self):
            self.respond(head=False)

        def do_HEAD(self):
            self.respond(head=True)

        def respond(self, head=False):
            port = self.server.server_port
            if self.headers.get("Host") not in (f"{HOST}:{port}", f"localhost:{port}"):
                self.send_error(403, "Local preview only")
                return
            try:
                raw_path = urllib.parse.urlsplit(self.path).path
                request_path = urllib.parse.unquote(raw_path, errors="strict")
            except (ValueError, UnicodeError):
                self.send_error(400, "Invalid path")
                return
            if request_path == HEALTH_PATH:
                self.send_content(json.dumps(identity).encode("utf-8"), "application/json", head)
                return
            # Never resolve traversal, Windows device/drive paths, or hidden files.
            parts = request_path.split("/")
            if any(part.startswith(".") for part in parts if part) or any(c in request_path for c in ("\\", ":", "\x00")):
                self.send_error(403, "Invalid path")
                return
            candidate = (dist / request_path.lstrip("/")).resolve()
            if not candidate.is_relative_to(dist):
                self.send_error(403, "Invalid path")
                return
            if candidate.is_dir():
                candidate = (candidate / "index.html").resolve()
            if not candidate.is_relative_to(dist):
                self.send_error(403, "Invalid path")
                return
            if not candidate.is_file():
                self.send_error(404, "Not found")
                return
            try:
                content = candidate.read_bytes()
            except OSError:
                self.send_error(404, "Not found")
                return
            content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
            if candidate.suffix in (".js", ".mjs"):
                content_type = "text/javascript; charset=utf-8"
            elif candidate.suffix in (".html", ".css", ".json", ".svg"):
                content_type += "; charset=utf-8"
            self.send_content(content, content_type, head)

        def send_content(self, content, content_type, head):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            # Especially important for sw.js and rebuilt index.html.
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            if not head:
                self.wfile.write(content)

    return Handler


def bind_available(root: Path, ports=PORTS) -> PreviewServer:
    if not (root / "dist" / "index.html").is_file():
        raise LaunchError("还没有找到英语小芽的网页文件。\n请让 Codex 在这个项目里完成构建后，再双击启动。\n你的学习记录不会因此丢失。")
    for port in ports:
        try:
            return PreviewServer((HOST, port), make_handler(root))
        except OSError:
            continue
    raise LaunchError("英语小芽的本地启动端口暂时都被占用了。\n请关闭之前打开的本地工具后重试，或让 Codex 检查 24736–24746 端口。")


class StartupLock:
    """Prevent simultaneous double-clicks from creating duplicate servers."""

    _fallback = threading.Lock()

    def __init__(self, root: Path):
        self.name = "Local\\EnglishSprout-" + project_identity(root)
        self.handle = None

    def __enter__(self):
        if os.name != "nt":
            self._fallback.acquire()
            return self
        from ctypes import wintypes

        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
        self.kernel.CreateMutexW.restype = wintypes.HANDLE
        self.kernel.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
        self.kernel.WaitForSingleObject.restype = wintypes.DWORD
        self.kernel.ReleaseMutex.argtypes = (wintypes.HANDLE,)
        self.kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
        self.handle = self.kernel.CreateMutexW(None, False, self.name)
        if not self.handle:
            raise LaunchError("英语小芽未能准备启动。请再双击一次；如果仍然出现，请把此提示告诉 Codex。")
        result = self.kernel.WaitForSingleObject(self.handle, 10000)
        if result not in (0, 0x80):
            self.kernel.CloseHandle(self.handle)
            self.handle = None
            raise LaunchError("英语小芽正在启动中。请稍等片刻再双击。")
        return self

    def __exit__(self, *exc):
        if self.handle is not None:
            self.kernel.ReleaseMutex(self.handle)
            self.kernel.CloseHandle(self.handle)
        elif os.name != "nt":
            self._fallback.release()


def start_or_reuse(root: Path, ports=PORTS):
    """Return (port, server, thread); reused servers have no owned server/thread."""
    ports = tuple(ports)
    with StartupLock(root):
        port = find_existing(root, ports)
        if port is not None:
            return port, None, None
        server = bind_available(root, ports)
        thread = threading.Thread(target=server.serve_forever, name="EnglishSproutHTTP", daemon=True)
        thread.start()
        return server.server_port, server, thread


def show_error(message: str):
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, "英语小芽 · 启动提示", 0x10)
    else:
        import sys
        print(message, file=sys.stderr)


def main(argv=None):
    parser = argparse.ArgumentParser(description="英语小芽本机预览")
    parser.add_argument("--no-browser", action="store_true", help="仅启动或复用服务，不自动打开浏览器（维护用）")
    args = parser.parse_args(argv)
    server = None
    try:
        port, server, thread = start_or_reuse(ROOT)
        url = f"http://{HOST}:{port}/"
        if not args.no_browser and not webbrowser.open(url):
            show_error(f"英语小芽已启动，但未能自动打开浏览器。\n请用浏览器打开：{url}")
        if thread is not None:
            thread.join()
    except LaunchError as exc:
        show_error(str(exc))
    except Exception:
        show_error("英语小芽暂时无法启动。\n请确认项目文件完整，并让 Codex 检查此项目的本地启动器。\n已有学习记录仍保存在你使用的浏览器里。")
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
