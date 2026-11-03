import base64
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import tempfile
from threading import Thread
import unittest


class CliSecurityTest(unittest.TestCase):
    def test_upload_keeps_the_secret_local_and_encrypts_the_file(self):
        forms = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                message = BytesParser(policy=policy.default).parsebytes(
                    b'Content-Type: ' + self.headers['Content-Type'].encode() + b'\r\n\r\n' + body
                )
                forms.append({part.get_param('name', header='content-disposition'):
                              part.get_payload(decode=True) for part in message.iter_parts()})
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"key":"abcd"}')

        root = Path(__file__).parent
        self.assertEqual((root / 'filedrop').read_bytes(),
                         (root / 'filedrop-frontend/public/filedrop').read_bytes())
        with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with tempfile.TemporaryDirectory() as directory:
                    source = Path(directory) / 'test.txt'
                    source.write_bytes(b'private test content')
                    result = subprocess.run([
                        'bash', str(root / 'filedrop'), str(source), '--yes',
                        '--url', f'http://127.0.0.1:{server.server_port}',
                    ], check=True, capture_output=True, text=True, timeout=15)
                    secret = re.search(r'Secret word: ([a-f0-9]{32})\b', result.stdout)
                    self.assertIsNotNone(secret, result.stdout)
                    form = forms[0]
                    self.assertNotIn('secretWord', form)
                    self.assertNotIn(secret.group(1).encode(), b''.join(form.values()))
                    self.assertNotEqual(form['file'], source.read_bytes())
                    salt = base64.b64decode(form['salt'])
                    iv = base64.b64decode(form['iv'])
                    import hashlib
                    key = hashlib.pbkdf2_hmac('sha256', secret.group(1).encode(), salt, 100000, 32)
                    decrypted = subprocess.run([
                        'openssl', 'enc', '-d', '-aes-256-cbc', '-K', key.hex(), '-iv', iv.hex(),
                    ], input=form['file'], capture_output=True, check=True)
                    self.assertEqual(decrypted.stdout, source.read_bytes())
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
