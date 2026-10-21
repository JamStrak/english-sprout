"""Separate product launcher: reuse, isolation, hidden-browser contract, safety."""
import importlib.util
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location("xiaoya_launcher", Path(__file__).resolve().parents[1] / "launcher_xiaoya.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class XiaoyaLauncherTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parents[1] / "test-results" / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.root = Path(self.temp.name)
        root_patch = patch.object(launcher, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)
        (self.root / "dist" / "xiaoya").mkdir(parents=True)
        (self.root / "dist" / "index.html").write_text("old-product", encoding="utf-8")
        (self.root / "dist" / "xiaoya" / "index.html").write_text("new-product", encoding="utf-8")
        (self.root / "private.txt").write_text("private", encoding="utf-8")
        self.servers, self.threads = [], []
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        for server in self.servers:
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(timeout=3)
        self.temp.cleanup()

    def start(self, ports=(0,)):
        server = launcher.bind_available(self.root, ports)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.servers.append(server)
        self.threads.append(thread)
        return server.server_port

    def read(self, port, path):
        return self.opener.open(f"http://127.0.0.1:{port}{path}", timeout=2)

    def test_separate_page_and_identity_with_old_page_preserved(self):
        port = self.start()
        with self.read(port, "/xiaoya/") as response:
            self.assertEqual(response.read(), b"new-product")
            self.assertEqual(response.headers["Cache-Control"], "no-cache")
        with self.read(port, "/") as response:
            self.assertEqual(response.read(), b"old-product")
        with self.read(port, launcher.HEALTH_PATH) as response:
            self.assertEqual(json.load(response), launcher.expected_health(self.root))
        self.assertIsNone(launcher._base.find_existing(self.root, [port]))

    def test_directory_redirect_preserves_html_base(self):
        port = self.start()
        with self.read(port, "/xiaoya") as response:
            self.assertTrue(response.url.endswith("/xiaoya/"))

    def test_same_checkout_reused_other_checkout_rejected(self):
        port = self.start()
        self.assertEqual(launcher.start_or_reuse(self.root, [port]), (port, None, None))
        self.assertIsNone(launcher.find_existing(self.root / "other", [port]))

    def test_concurrent_double_clicks_have_one_owner(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: launcher.start_or_reuse(self.root, [port]), range(3)))
        owners = [(server, thread) for _, server, thread in results if server]
        for server, thread in owners:
            self.servers.append(server)
            self.threads.append(thread)
        self.assertEqual(len(owners), 1)
        self.assertEqual([value[0] for value in results], [port] * 3)

    def test_occupied_port_falls_back_without_reusing_other_service(self):
        occupied = socket.socket()
        occupied.bind(("127.0.0.1", 0))
        occupied.listen(2)
        self.addCleanup(occupied.close)
        port = occupied.getsockname()[1]
        self.assertIsNone(launcher.find_existing(self.root, [port], timeout=0.03))
        self.assertNotEqual(self.start([port, 0]), port)

    def test_missing_new_build_and_exhausted_ports_are_actionable(self):
        port = self.start()
        with self.assertRaisesRegex(launcher.LaunchError, "24756"):
            launcher.bind_available(self.root, [port])
        (self.root / "dist" / "xiaoya" / "index.html").unlink()
        with self.assertRaisesRegex(launcher.LaunchError, "小芽英语.*网页文件"):
            launcher.bind_available(self.root, [0])

    def test_no_browser_and_default_product_url(self):
        with patch.object(launcher, "start_or_reuse", return_value=(24756, None, None)), patch.object(launcher.webbrowser, "open", return_value=True) as browser:
            launcher.main(["--no-browser"])
            browser.assert_not_called()
            launcher.main([])
            browser.assert_called_once_with("http://127.0.0.1:24756/xiaoya/")

    def test_existing_public_or_internal_build_is_never_overwritten(self):
        with patch.object(launcher.subprocess, "run") as build:
            launcher.ensure_build(self.root)
        build.assert_not_called()
        self.assertEqual((self.root / "dist/xiaoya/index.html").read_text(), "new-product")

    def test_latest_build_uses_distinct_entry_on_reused_server_and_preserves_garden(self):
        output = self.root / "dist/xiaoya"
        build = "0123456789ab"
        (output / "version.json").write_text(json.dumps({"build": build}), encoding="utf-8")
        (output / f"start-{build}.html").write_text("latest immutable product", encoding="utf-8")
        port = self.start()
        with patch.object(launcher, "start_or_reuse", return_value=(port, None, None)), patch.object(launcher.webbrowser, "open", return_value=True) as browser:
            launcher.main(["--garden", "b"])
        url = f"http://127.0.0.1:{port}/xiaoya/start-{build}.html?garden=b"
        browser.assert_called_once_with(url)
        with self.opener.open(url, timeout=2) as response:
            self.assertEqual(response.read(), b"latest immutable product")
            self.assertEqual(response.headers["Cache-Control"], "no-cache")

    def test_startup_metadata_is_validated_and_older_builds_fall_back_safely(self):
        output = self.root / "dist/xiaoya"
        self.assertEqual(launcher.startup_path(self.root), "/xiaoya/")
        for value in ("not json", "[]", "null", '{"build": "../../private"}', '{"build": 123}', '{"build": "ABCDEF123456"}', '{"build": "0123456789ab"}'):
            with self.subTest(metadata=value):
                (output / "version.json").write_text(value, encoding="utf-8")
                self.assertEqual(launcher.startup_path(self.root), "/xiaoya/")

    def test_legacy_garden_shortcuts_only_launch_the_free_garden(self):
        for garden in ("a", "b"):
            with self.subTest(garden=garden), patch.object(launcher, "start_or_reuse", return_value=(24759, None, None)), patch.object(launcher.webbrowser, "open", return_value=True) as browser:
                launcher.main(["--garden", garden])
                browser.assert_called_once_with("http://127.0.0.1:24759/xiaoya/?garden=b")
        with patch.object(launcher, "start_or_reuse", return_value=(24759, None, None)), patch.object(launcher.webbrowser, "open") as browser:
            launcher.main(["--garden", "b", "--no-browser"])
            browser.assert_not_called()

    def test_old_startup_bookmark_redirects_to_current_release_without_losing_query(self):
        output = self.root / "dist/xiaoya"
        build = "0123456789ab"
        (output / "version.json").write_text(json.dumps({"build": build}), encoding="utf-8")
        (output / f"start-{build}.html").write_text("current free garden", encoding="utf-8")
        (output / "start-aaaaaaaaaaaa.html").write_text("retired page", encoding="utf-8")
        port = self.start()
        with self.read(port, "/xiaoya/start-aaaaaaaaaaaa.html?garden=b&story=hello-goodbye") as response:
            self.assertEqual(response.read(), b"current free garden")
            self.assertTrue(response.url.endswith(f"/xiaoya/start-{build}.html?garden=b&story=hello-goodbye"))

    def test_missing_build_uses_hidden_internal_builder(self):
        index = self.root / "dist/xiaoya/index.html"
        index.unlink()
        script = self.root / "scripts/build.mjs"
        script.parent.mkdir()
        script.write_text("// fixture", encoding="utf-8")
        def complete(*args, **kwargs):
            index.write_text("internal-product", encoding="utf-8")
            return Mock(returncode=0)
        with patch.object(launcher.shutil, "which", return_value="node"), patch.object(launcher.subprocess, "run", side_effect=complete) as build:
            launcher.ensure_build(self.root)
        self.assertEqual(build.call_args.args[0], ["node", str(script), "--internal"])
        self.assertEqual(build.call_args.kwargs["cwd"], self.root)
        self.assertTrue(build.call_args.kwargs["capture_output"])
        self.assertEqual(build.call_args.kwargs["creationflags"], launcher.subprocess.CREATE_NO_WINDOW if launcher.os.name == "nt" else 0)

    def test_missing_build_has_actionable_failure(self):
        (self.root / "dist/xiaoya/index.html").unlink()
        with patch.object(launcher.shutil, "which", return_value=None), self.assertRaisesRegex(launcher.LaunchError, "npm run build:dev"):
            launcher.ensure_build(self.root)
        script = self.root / "scripts/build.mjs"
        script.parent.mkdir()
        script.write_text("// fixture", encoding="utf-8")
        with patch.object(launcher.shutil, "which", return_value="node"), patch.object(launcher.subprocess, "run", return_value=Mock(returncode=1, stderr="test build error", stdout="")), self.assertRaisesRegex(launcher.LaunchError, "test build error"):
            launcher.ensure_build(self.root)

    def test_owned_server_stays_running_and_shuts_down_cleanly(self):
        server, thread = Mock(), Mock()
        with patch.object(launcher, "start_or_reuse", return_value=(24756, server, thread)):
            launcher.main(["--no-browser"])
        thread.join.assert_called_once_with()
        server.shutdown.assert_called_once_with()
        server.server_close.assert_called_once_with()

    def test_private_files_paths_and_nonlocal_hosts_rejected(self):
        port = self.start()
        for path in ("/private.txt", "/%2e%2e/private.txt", "/%2e%2e%5cprivate.txt", "/C:/Windows/win.ini", "/.env", "/%00"):
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as caught:
                self.read(port, path)
            self.assertIn(caught.exception.code, (403, 404))
        request = urllib.request.Request(f"http://127.0.0.1:{port}{launcher.HEALTH_PATH}", headers={"Host":"evil.example"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.opener.open(request, timeout=2)
        self.assertEqual(caught.exception.code, 403)

    def test_global_legacy_identity_is_not_mutated(self):
        self.assertEqual(launcher._base.APP_ID, "english-sprout")
        self.assertEqual(launcher._base.HEALTH_PATH, "/__english_sprout_health")
        self.assertEqual(launcher._base.PORTS.start, 24736)
        self.assertNotEqual(launcher.StartupLock(self.root).name, launcher._base.StartupLock(self.root).name)

    def test_double_click_wrapper_is_hidden_and_checks_required_files(self):
        wrapper = (Path(__file__).resolve().parents[1] / "启动小芽英语.vbs").read_text(encoding="utf-16")
        self.assertIn('launcher_xiaoya.py', wrapper)
        self.assertIn('fso.BuildPath(base, "launcher.py")', wrapper)
        self.assertIn('pythonw.exe', wrapper)
        self.assertIn(', 0, False', wrapper)
        self.assertIn('" --garden b"', wrapper)


if __name__ == "__main__":
    unittest.main()
