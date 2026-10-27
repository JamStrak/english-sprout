"""Hidden, loopback-only launcher for the separate 小芽英语 app."""
from __future__ import annotations

import argparse
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("_xiaoya_preview_base", ROOT / "launcher.py")
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)
LaunchError = _base.LaunchError
PreviewServer = _base.PreviewServer
project_identity = _base.project_identity
HOST = "127.0.0.1"
PORTS = range(24756, 24767)
APP_ID = "xiaoya-english"
HEALTH_PATH = "/__xiaoya_english_health"


def expected_health(root: Path) -> dict:
    return {"app": APP_ID, "protocol": 1, "project": project_identity(root)}


def find_existing(root: Path, ports=PORTS, timeout=0.15) -> int | None:
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


def make_handler(root: Path):
    parent = _base.make_handler(root)
    identity = expected_health(root)

    class Handler(parent):
        server_version = "XiaoyaEnglish"

        def respond(self, head=False):
            port = self.server.server_port
            if self.headers.get("Host") not in (f"{HOST}:{port}", f"localhost:{port}"):
                self.send_error(403, "Local preview only")
                return
            try:
                request_path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path, errors="strict")
            except (ValueError, UnicodeError):
                self.send_error(400, "Invalid path")
                return
            if request_path == HEALTH_PATH:
                self.send_content(json.dumps(identity).encode("utf-8"), "application/json", head)
                return
            if request_path == _base.HEALTH_PATH:
                self.send_error(404, "Not found")
                return
            if request_path == "/xiaoya":
                self.send_response(308)
                self.send_header("Location", "/xiaoya/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if re.fullmatch(r"/xiaoya/start-[a-f0-9]{12}\.html", request_path):
                current = startup_path(root)
                if current != "/xiaoya/" and request_path != current:
                    query = urllib.parse.urlsplit(self.path).query
                    self.send_response(307)
                    self.send_header("Location", current + ("?" + query if query else ""))
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
            super().respond(head)

    return Handler


def bind_available(root: Path, ports=PORTS) -> PreviewServer:
    if not (root / "dist" / "xiaoya" / "index.html").is_file():
        raise LaunchError("还没有找到小芽英语的网页文件。\n请让 Codex 在这个分支里完成构建后，再双击启动。\n已有学习记录不会因此丢失。")
    for port in ports:
        try:
            return PreviewServer((HOST, port), make_handler(root))
        except OSError:
            continue
    raise LaunchError("小芽英语的本地启动端口暂时都被占用了。\n请关闭之前打开的本地工具后重试，或让 Codex 检查 24756–24766 端口。")


def ensure_build(root: Path):
    """Keep local preview on the internal build, with the GM workbench available."""
    output = root / "dist" / "xiaoya"
    try:
        metadata = json.loads((output / "version.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        metadata = None
    if (output / "index.html").is_file() and isinstance(metadata, dict) and metadata.get("channel") == "internal":
        return
    script = root / "scripts" / "build.mjs"
    node = shutil.which("node")
    if not script.is_file() or not node:
        raise LaunchError("小芽英语还没有网页文件，且缺少首次构建需要的 Node.js 或项目文件。\n请让 Codex 检查项目，再运行 npm run build:dev。已有学习记录不会丢失。")
    try:
        result = subprocess.run(
            [node, str(script), "--internal"], cwd=root, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=180,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise LaunchError("小芽英语首次构建未能完成。\n请让 Codex 检查 Node.js，再运行 npm run build:dev。已有学习记录不会丢失。") from error
    try:
        built = json.loads((output / "version.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        built = None
    if result.returncode != 0 or not (output / "index.html").is_file() or not isinstance(built, dict) or built.get("channel") != "internal":
        detail = (result.stderr or result.stdout or "没有生成网页文件").strip()[-1200:]
        raise LaunchError(f"小芽英语首次构建失败，请让 Codex 检查后运行 npm run build:dev。\n{detail}")


class StartupLock(_base.StartupLock):
    _fallback = threading.Lock()

    def __init__(self, root: Path):
        super().__init__(root)
        self.name = "Local\\XiaoyaEnglish-" + project_identity(root)

    def __enter__(self):
        try:
            return super().__enter__()
        except LaunchError as error:
            raise LaunchError(str(error).replace("英语小芽", "小芽英语")) from error


def start_or_reuse(root: Path, ports=PORTS):
    ports = tuple(ports)
    with StartupLock(root):
        ensure_build(root)
        port = find_existing(root, ports)
        if port is not None:
            return port, None, None
        server = bind_available(root, ports)
        thread = threading.Thread(target=server.serve_forever, name="XiaoyaEnglishHTTP", daemon=True)
        thread.start()
        return server.server_port, server, thread


def show_error(message: str):
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, "小芽英语启蒙正式版 · 启动提示", 0x10)
    else:
        import sys
        print(message, file=sys.stderr)


def startup_path(root: Path) -> str:
    """Use an immutable entry without moving origin or touching browser data."""
    output = root / "dist" / "xiaoya"
    try:
        metadata = json.loads((output / "version.json").read_text(encoding="utf-8"))
        build = metadata.get("build") if isinstance(metadata, dict) else None
    except (OSError, ValueError):
        return "/xiaoya/"
    if not isinstance(build, str) or not re.fullmatch(r"[a-f0-9]{12}", build):
        return "/xiaoya/"
    filename = f"start-{build}.html"
    candidate = (output / filename).resolve()
    if candidate.parent != output.resolve() or not candidate.is_file():
        return "/xiaoya/"
    return f"/xiaoya/{filename}"


def main(argv=None):
    parser = argparse.ArgumentParser(description="小芽英语启蒙正式版本机预览")
    parser.add_argument("--no-browser", action="store_true", help="仅启动或复用服务，不自动打开浏览器（维护用）")
    # Accept old desktop shortcuts but never launch the retired flowerpot game.
    parser.add_argument("--garden", choices=("a", "b"), help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    server = None
    try:
        port, server, thread = start_or_reuse(ROOT)
        url = f"http://{HOST}:{port}{startup_path(ROOT)}"
        if args.garden:
            url += "?garden=b"
        if not args.no_browser and not webbrowser.open(url):
            show_error(f"小芽英语已启动，但未能自动打开浏览器。\n请用浏览器打开：{url}")
        if thread is not None:
            thread.join()
    except LaunchError as error:
        show_error(str(error))
    except Exception:
        show_error("小芽英语暂时无法启动。\n请确认项目文件完整，并让 Codex 检查此项目的 launcher_xiaoya.py 与 launcher.py。\n已有学习记录仍保存在你使用的浏览器里。")
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
