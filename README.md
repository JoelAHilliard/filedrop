# Filedrop

A solution for swift and uncomplicated file sharing between computers. Designed for speed and simplicity, this application allows users to pass files quickly without the need for an account or any complicated setup.

## Features

- **End-to-end encryption**: Files are encrypted with AES-256 before upload
- **No account required**: Just upload and share the access code
- **Customizable expiry**: Set TTL from 5 minutes to 3 days
- **Download limits**: Control how many times a file can be downloaded
- **Burn after read**: Option to auto-delete after first download

## Project Structure

- `backend/` - Flask API server for file storage (uses Cloudflare R2)
- `filedrop-frontend/` - Preact web application
- `filedrop` - CLI tool for uploading/downloading files

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt
# Set environment variables: CLOUDFLARE_R2_ENDPOINT, S3_ACCESS_Key, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME
python app.py  # local development only
```

Production (from repository root):

```bash
gunicorn --bind 0.0.0.0:${PORT:-4000} --workers 1 --threads 8 --timeout 120 backend.app:app
```

Run `python backend/app.py cleanup` from a **single scheduled job every 30 minutes**,
with the same R2 environment variables. Cleanup no longer runs inside web workers.
Expired files remain inaccessible even between cleanup runs. Monitor job failures.

One web worker keeps the existing per-IP rate limits consistent within this process;
multiple workers/replicas need shared rate-limit storage. Uploads remain limited to
20/minute/IP and 500MiB per request; the old hour-long global shutdown is removed.
Set platform concurrency/memory limits to match your deployment.

Current clients receive chunked downloads; legacy clients without
`deferConsumption=1` still buffer before consuming files for compatibility.
Uploads use Werkzeug's spooled file stream rather than a second full RAM copy;
they still pass through the backend. Ensure sufficient temporary disk space.
Disable reverse-proxy response buffering where supported to preserve streaming.

Storage uses a 5-second connection timeout, 60-second read inactivity timeout,
and at most 3 attempts (not a total transfer deadline). Browser/CLI transfers
have a 30-minute deadline; CLI confirmation has a 15-second deadline. A timeout
may occur after an upload or confirmation succeeded: do not automatically retry
confirmation, which is not idempotent. Multi-download counts still use R2 metadata
copies; moving counts to a transactional store needs a separate migration.

Tests:

```bash
python -m unittest backend.test_retrieval -v
```

Browser regression check (with Chromium installed and `npm run dev` running):

```bash
npm install --prefix /tmp/filedrop-browser playwright-core
NODE_PATH=/tmp/filedrop-browser/node_modules node filedrop-frontend/test-upload.cjs
# Set CHROMIUM if executable is not /usr/bin/chromium.
```

### Frontend

```bash
cd filedrop-frontend
npm install
npm run dev
```

### CLI

```bash
# Upload a file
./filedrop ./photo.jpg

# Download a file
./filedrop download <accessCode> <secretWord> --out ./photo.jpg
```
