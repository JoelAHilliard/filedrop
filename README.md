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
python app.py
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
