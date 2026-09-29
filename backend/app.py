import os
from time import monotonic
from flask import Flask, Response, request, jsonify, send_file
from werkzeug.utils import secure_filename
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ConnectionClosedError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError
from datetime import datetime, timedelta
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)
app.config['CORS_HEADERS'] = 'Content-Type'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB

# Limits for file lifecycle settings
DEFAULT_TTL_SECONDS = 24 * 60 * 60
MIN_TTL_SECONDS = 5 * 60
MAX_TTL_SECONDS = 3 * 24 * 60 * 60
DEFAULT_MAX_DOWNLOADS = 1
MAX_DOWNLOADS_LIMIT = 100

# Configure S3 client for Cloudflare R2
s3_client = boto3.client(
    's3',
    region_name='auto',
    endpoint_url=os.getenv('CLOUDFLARE_R2_ENDPOINT'),
    aws_access_key_id=os.getenv('S3_ACCESS_Key'),
    aws_secret_access_key=os.getenv('S3_SECRET_ACCESS_KEY'),
    config=Config(
        s3={'addressing_style': 'path'},
        connect_timeout=5,
        read_timeout=10,
        retries={'mode': 'standard', 'total_max_attempts': 3},
    )
)

def close_storage_connection(request, **kwargs):
    # ponytail: avoid stale pooled R2 connections; costs a TLS handshake per request.
    request.headers['Connection'] = 'close'


s3_client.meta.events.register('before-sign.s3', close_storage_connection)

# Basic in-memory rate limiting (per IP, per endpoint)
RATE_LIMIT_WINDOW_SECONDS = 60
UPLOAD_RATE_LIMIT = 20
DOWNLOAD_RATE_LIMIT = 60
rate_limit_uploads = {}
rate_limit_downloads = {}
rate_limit_confirmations = {}

def generate_access_code():
    import secrets
    return secrets.token_hex(2)

def parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=None)
    except ValueError:
        return None

def clamp_int(value, default, min_value=None, max_value=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if min_value is not None and parsed < min_value:
        return min_value
    if max_value is not None and parsed > max_value:
        return max_value
    return parsed

def delete_old_files():
    bucket = os.getenv('S3_BUCKET_NAME')
    now = datetime.utcnow()
    # ponytail: sequential HEADs in a separate job; add bounded concurrency if runs overlap.
    for page in s3_client.get_paginator('list_objects_v2').paginate(Bucket=bucket):
        to_delete = []
        for obj in page.get('Contents', []):
            key = obj['Key']
            try:
                head = s3_client.head_object(Bucket=bucket, Key=key)
            except ClientError as e:
                if e.response.get('Error', {}).get('Code') in {'404', 'NoSuchKey'}:
                    continue
                raise
            metadata = head.get('Metadata', {})
            created_at = parse_iso_datetime(metadata.get('created_at')) or obj['LastModified'].replace(tzinfo=None)
            ttl_seconds = clamp_int(metadata.get('ttl_seconds'), DEFAULT_TTL_SECONDS, MIN_TTL_SECONDS, MAX_TTL_SECONDS)
            expires_at = parse_iso_datetime(metadata.get('expires_at')) or created_at + timedelta(seconds=ttl_seconds)
            remaining_downloads = clamp_int(metadata.get('remaining_downloads'), DEFAULT_MAX_DOWNLOADS, 0, MAX_DOWNLOADS_LIMIT)
            if remaining_downloads <= 0 or now >= expires_at:
                to_delete.append({'Key': key})
        if to_delete:
            result = s3_client.delete_objects(Bucket=bucket, Delete={'Objects': to_delete})
            if result.get('Errors'):
                raise RuntimeError(f"Cleanup failed: {result['Errors']}")
            print(f"Deleted {len(to_delete)} old files.")

def get_client_ip():
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'

def rate_limit_ok(store, limit):
    now = datetime.now().timestamp()
    ip = get_client_ip()
    window_start, count = store.get(ip, (now, 0))
    if now - window_start >= RATE_LIMIT_WINDOW_SECONDS:
        window_start, count = now, 0
    count += 1
    store[ip] = (window_start, count)
    return count <= limit

def consume_download(access_code, metadata, content_type):
    remaining_downloads = clamp_int(metadata.get('remaining_downloads'), DEFAULT_MAX_DOWNLOADS, 0, MAX_DOWNLOADS_LIMIT)
    if remaining_downloads <= 1:
        s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
    else:
        metadata = dict(metadata)
        metadata['remaining_downloads'] = str(remaining_downloads - 1)
        s3_client.copy_object(
            Bucket=os.getenv('S3_BUCKET_NAME'),
            Key=access_code,
            CopySource={'Bucket': os.getenv('S3_BUCKET_NAME'), 'Key': access_code},
            Metadata=metadata,
            MetadataDirective='REPLACE',
            ContentType=content_type,
            ServerSideEncryption='AES256'
        )
    return max(remaining_downloads - 1, 0)

@app.errorhandler(ConnectionClosedError)
@app.errorhandler(ConnectTimeoutError)
@app.errorhandler(EndpointConnectionError)
@app.errorhandler(ReadTimeoutError)
def storage_unavailable(error):
    app.logger.warning('Storage unavailable: %s', error)
    return jsonify({'error': 'Storage unavailable or timed out. Please try again.'}), 504


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({'error': 'File too large. Max size is 500MB.'}), 413

@app.route('/upload', methods=['POST'])
def upload_file():
    started = monotonic()
    if not rate_limit_ok(rate_limit_uploads, UPLOAD_RATE_LIMIT):
        return jsonify({'error': 'Too many uploads from this IP. Please slow down.'}), 429
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded.'}), 400
    
    file = request.files['file']
    # Although the secret word is sent, the server no longer uses it.
    secret_word = request.form.get('secretWord')
    file_type = request.form.get('type')
    iv = request.form.get('iv')  # Provided from client (Base64)
    salt = request.form.get('salt')  # Provided from client (Base64)
    ttl_seconds = clamp_int(request.form.get('ttlSeconds'), DEFAULT_TTL_SECONDS, MIN_TTL_SECONDS, MAX_TTL_SECONDS)
    max_downloads = clamp_int(request.form.get('maxDownloads'), DEFAULT_MAX_DOWNLOADS, 1, MAX_DOWNLOADS_LIMIT)
    
    if not file or not secret_word or not iv or not salt:
        return jsonify({'error': 'Missing file, secret word, iv or salt'}), 400
    
    extension = secure_filename(file.filename).rsplit('.', 1)[-1] if '.' in file.filename else 'bin'
    created_at = datetime.utcnow()
    expires_at = created_at + timedelta(seconds=ttl_seconds)

    storage_started = monotonic()
    for _ in range(10):
        access_code = generate_access_code()
        file.stream.seek(0)
        try:
            result = s3_client.put_object(
                Bucket=os.getenv('S3_BUCKET_NAME'),
                Key=access_code,
                Body=file.stream,
                IfNoneMatch='*',
                ServerSideEncryption='AES256',
                ContentType='application/octet-stream',
                Metadata={
                    'filetype': file_type or 'unknown',
                    'iv': iv,
                    'salt': salt,
                    'extension': extension,
                    'created_at': created_at.isoformat() + 'Z',
                    'ttl_seconds': str(ttl_seconds),
                    'expires_at': expires_at.isoformat() + 'Z',
                    'max_downloads': str(max_downloads),
                    'remaining_downloads': str(max_downloads)
                }
            )
            break
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') not in {'PreconditionFailed', 'ConditionalRequestConflict', '409', '412'}:
                raise
    else:
        return jsonify({'error': 'Could not allocate an access code. Please retry.'}), 503
    
    print(
        f"Upload completed: receive={storage_started - started:.3f}s "
        f"storage={monotonic() - storage_started:.3f}s "
        f"storage_retries={result.get('ResponseMetadata', {}).get('RetryAttempts', 0)}",
        flush=True,
    )
    return jsonify({
        'message': 'File uploaded successfully',
        'key': access_code,
        'expiresAt': expires_at.isoformat() + 'Z',
        'maxDownloads': max_downloads,
        'ttlSeconds': ttl_seconds
    })

@app.route('/retrieve', methods=['GET'])
def retrieve_file():
    if not rate_limit_ok(rate_limit_downloads, DOWNLOAD_RATE_LIMIT):
        return jsonify({'error': 'Too many downloads from this IP. Please slow down.'}), 429
    
    access_code = request.args.get('accessCode')
    if not access_code:
        return jsonify({'error': 'Access code is required'}), 400

    body = None
    try:
        s3_response = s3_client.get_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
        body = s3_response['Body']
        metadata = s3_response.get('Metadata', {})
        iv = metadata.get('iv', '').replace(' ', '+')
        salt = metadata.get('salt', '').replace(' ', '+')
        created_at = parse_iso_datetime(metadata.get('created_at'))
        ttl_seconds = clamp_int(metadata.get('ttl_seconds'), DEFAULT_TTL_SECONDS, MIN_TTL_SECONDS, MAX_TTL_SECONDS)
        expires_at = parse_iso_datetime(metadata.get('expires_at'))
        if not created_at:
            created_at = s3_response.get('LastModified', datetime.utcnow()).replace(tzinfo=None)
        if not expires_at:
            expires_at = created_at + timedelta(seconds=ttl_seconds)
        remaining_downloads = clamp_int(metadata.get('remaining_downloads'), DEFAULT_MAX_DOWNLOADS, 0, MAX_DOWNLOADS_LIMIT)
        max_downloads = clamp_int(metadata.get('max_downloads'), DEFAULT_MAX_DOWNLOADS, 1, MAX_DOWNLOADS_LIMIT)

        if datetime.utcnow() >= expires_at:
            body.close()
            s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
            return jsonify({'error': 'File expired.'}), 410

        if remaining_downloads <= 0:
            body.close()
            s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
            return jsonify({'error': 'Download limit reached.'}), 410

        def chunks():
            try:
                while chunk := body.read(256 * 1024):
                    yield chunk
            finally:
                body.close()

        response = Response(chunks(), mimetype='application/octet-stream')
        response.call_on_close(body.close)
        if 'ContentLength' in s3_response:
            response.content_length = s3_response['ContentLength']
        response.headers['X-IV'] = iv
        response.headers['X-SALT'] = salt
        response.headers['X-EXTENSION'] = metadata.get('extension', 'bin')
        response.headers['X-EXPIRES-AT'] = expires_at.isoformat() + 'Z'
        response.headers['X-REMAINING-DOWNLOADS'] = str(max(remaining_downloads - 1, 0))
        response.headers['X-MAX-DOWNLOADS'] = str(max_downloads)
        response.headers['Access-Control-Expose-Headers'] = 'X-IV, X-SALT, X-EXTENSION, X-EXPIRES-AT, X-REMAINING-DOWNLOADS, X-MAX-DOWNLOADS'

        # Older clients consume immediately; current clients confirm after successful decryption.
        if request.args.get('deferConsumption') != '1':
            # Legacy clients cannot confirm; finish reading before consuming their file.
            response.set_data(body.read())
            body.close()
            consume_download(access_code, metadata, s3_response.get('ContentType', 'application/octet-stream'))

        return response
    except ClientError as e:
        if body is not None:
            body.close()
        if e.response.get('Error', {}).get('Code') == 'NoSuchKey':
            return jsonify({'error': 'File not found.'}), 404
        print(f"Error: {e}")
        return Response("Server error", status=500)
    except (ConnectionClosedError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError) as e:
        if body is not None:
            body.close()
        return storage_unavailable(e)
    except Exception as e:
        if body is not None:
            body.close()
        app.logger.exception('Retrieval failed')
        return Response("Server error", status=500)


@app.route('/confirm-retrieval', methods=['POST'])
def confirm_retrieval():
    if not rate_limit_ok(rate_limit_confirmations, DOWNLOAD_RATE_LIMIT):
        return jsonify({'error': 'Too many downloads from this IP. Please slow down.'}), 429

    access_code = request.args.get('accessCode')
    if not access_code:
        return jsonify({'error': 'Access code is required'}), 400

    try:
        head = s3_client.head_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
        remaining_downloads = consume_download(
            access_code,
            head.get('Metadata', {}),
            head.get('ContentType', 'application/octet-stream')
        )
        return jsonify({'remainingDownloads': remaining_downloads})
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') in {'404', 'NoSuchKey'}:
            return jsonify({'error': 'File not found.'}), 404
        print(f"Error: {e}")
        return jsonify({'error': 'Server error'}), 500


@app.route('/')
def home():
    return "Hello", 200


@app.route('/install')
@app.route('/install.sh')
def serve_install():
    # Clients run:  curl -fsSL https://filedrop.xyz/install.sh | sh
    here = os.path.dirname(os.path.abspath(__file__))
    return send_file(
        os.path.join(here, '..', 'install.sh'),
        mimetype='text/x-shellscript',
        as_attachment=False,
    )


@app.route('/filedrop')
def serve_cli():
    # The CLI itself, so `install.sh` on this host can fetch it same-origin.
    here = os.path.dirname(os.path.abspath(__file__))
    return send_file(
        os.path.join(here, '..', 'filedrop'),
        mimetype='application/octet-stream',
        as_attachment=False,
    )

if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['cleanup']:
        delete_old_files()
    else:
        port = int(os.getenv('PORT', '4000'))
        app.run(host='0.0.0.0', port=port)
