"""Local launcher checks; every temporary server is shut down after its test."""
import importlib.util
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request


spec = importlib.util.spec_from_file_location("english_sprout_launcher", Path(__file__).resolve().parents[1] / "launcher.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "dist").mkdir()
        (self.root / "dist" / "index.html").write_text("<html>sprout</html>", encoding="utf-8")
        (self.root / "dist" / "sw.js").write_text("self.addEventListener('fetch', () => {});", encoding="utf-8")
        (self.root / "private.txt").write_text("must-not-be-public", encoding="utf-8")
        self.servers = []
        self.threads = []
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        for server in self.servers:
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(timeout=3)
        self.temp.cleanup()

    def start(self, root=None, ports=(0,)):
        server = launcher.bind_available(root or self.root, ports)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.servers.append(server)
        self.threads.append(thread)
        return server.server_port

    def read(self, port, path="/"):
        return self.opener.open(f"http://127.0.0.1:{port}{path}", timeout=2)

    def test_normal_static_and_health(self):
        port = self.start()
        with self.read(port) as response:
            self.assertIn(b"sprout", response.read())
            self.assertIn("text/html", response.headers["Content-Type"])
        with self.read(port, launcher.HEALTH_PATH) as response:
            self.assertEqual(json.load(response), launcher.expected_health(self.root))
        with self.read(port, "/sw.js") as response:
            self.assertEqual(response.headers["Cache-Control"], "no-cache")
            self.assertIn("text/javascript", response.headers["Content-Type"])

    def test_reuses_same_project(self):
        port = self.start()
        actual_port, server, thread = launcher.start_or_reuse(self.root, [port])
        self.assertEqual(actual_port, port)
        self.assertIsNone(server)
        self.assertIsNone(thread)

    def test_different_project_is_not_reused(self):
        port = self.start()
        other = self.root / "other-checkout"
        self.assertIsNone(launcher.find_existing(other, [port]))

    def test_simultaneous_launches_reuse_one_instance(self):
        probe = socket.socket()
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
        probe.close()
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: launcher.start_or_reuse(self.root, [port]), range(3)))
        owners = [(server, thread) for _, server, thread in results if server is not None]
        for server, thread in owners:
            self.servers.append(server)
            self.threads.append(thread)
        self.assertEqual(len(owners), 1)
        self.assertEqual([result[0] for result in results], [port] * 3)

    def test_unrelated_service_and_occupied_port_fall_back(self):
        occupied = socket.socket()
        occupied.bind(("127.0.0.1", 0))
        occupied.listen(2)
        self.addCleanup(occupied.close)
        port = occupied.getsockname()[1]
        self.assertIsNone(launcher.find_existing(self.root, [port], timeout=0.03))
        fallback_port = self.start(ports=[port, 0])
        self.assertNotEqual(fallback_port, port)
        with self.read(fallback_port) as response:
            self.assertEqual(response.status, 200)

    def test_missing_build_is_actionable(self):
        (self.root / "dist" / "index.html").unlink()
        with self.assertRaisesRegex(launcher.LaunchError, "Codex"):
            launcher.bind_available(self.root, [0])

    def test_all_ports_occupied_is_actionable(self):
        port = self.start()
        with self.assertRaisesRegex(launcher.LaunchError, "端口"):
            launcher.bind_available(self.root, [port])

    def test_project_root_and_traversal_not_exposed(self):
        port = self.start()
        for path in ("/private.txt", "/../private.txt", "/%2e%2e/private.txt", "/%2e%2e%5cprivate.txt", "/C:/Windows/win.ini", "/.env", "/%00"):
            with self.subTest(path=path):
                with self.assertRaises(urllib.error.HTTPError) as context:
                    self.read(port, path)
                self.assertIn(context.exception.code, (403, 404))

    def test_directory_listing_disabled(self):
        (self.root / "dist" / "assets").mkdir()
        (self.root / "dist" / "assets" / "visible.js").write_text("ok")
        port = self.start()
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.read(port, "/assets/")
        self.assertEqual(context.exception.code, 404)

    def test_symlink_escape_is_rejected(self):
        link = self.root / "dist" / "outside.txt"
        try:
            link.symlink_to(self.root / "private.txt")
        except OSError:
            self.skipTest("Host does not allow creating symlinks")
        port = self.start()
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.read(port, "/outside.txt")
        self.assertEqual(context.exception.code, 403)

    def test_nonlocal_host_header_rejected(self):
        port = self.start()
        request = urllib.request.Request(f"http://127.0.0.1:{port}/", headers={"Host": "evil.example"})
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.opener.open(request, timeout=2)
        self.assertEqual(context.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
