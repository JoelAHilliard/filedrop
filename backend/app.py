import os
from flask import Flask, Response, request, jsonify
from werkzeug.utils import secure_filename
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from apscheduler.schedulers.background import BackgroundScheduler
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
    config=Config(s3={'addressing_style': 'path'})
)

# Global counters and pause state
global_upload_counter = 0
global_upload_size = 0  # in MB
pause_uploads_downloads = False

# Basic in-memory rate limiting (per IP, per endpoint)
RATE_LIMIT_WINDOW_SECONDS = 60
UPLOAD_RATE_LIMIT = 20
DOWNLOAD_RATE_LIMIT = 60
rate_limit_uploads = {}
rate_limit_downloads = {}

def check_and_pause_uploads_downloads():
    global pause_uploads_downloads
    if global_upload_counter >= 50 or global_upload_size >= 2000:
        pause_uploads_downloads = True
        print('Uploads/Downloads paused for 1 hour due to high traffic.')
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            lambda: globals().update(pause_uploads_downloads=False),
            'date',
            run_date=datetime.now() + timedelta(hours=1)
        )
        scheduler.start()
        print('Uploads/Downloads resumed.')

def generate_access_code(length=4):
    import secrets
    return secrets.token_hex(length)[:length]

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
    try:
        response = s3_client.list_objects_v2(Bucket=os.getenv('S3_BUCKET_NAME'))
        if 'Contents' not in response:
            print("No old files to delete.")
            return
        now = datetime.utcnow()
        to_delete = []
        for obj in response['Contents']:
            key = obj['Key']
            try:
                head = s3_client.head_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=key)
                metadata = head.get('Metadata', {})
                created_at = parse_iso_datetime(metadata.get('created_at'))
                ttl_seconds = clamp_int(metadata.get('ttl_seconds'), DEFAULT_TTL_SECONDS, MIN_TTL_SECONDS, MAX_TTL_SECONDS)
                if not created_at:
                    created_at = obj['LastModified'].replace(tzinfo=None)
                expires_at = created_at + timedelta(seconds=ttl_seconds)
                remaining_downloads = clamp_int(metadata.get('remaining_downloads'), DEFAULT_MAX_DOWNLOADS, 0, MAX_DOWNLOADS_LIMIT)
                if remaining_downloads <= 0 or now >= expires_at:
                    to_delete.append({'Key': key})
            except Exception as e:
                print(f"Error checking file {key}: {e}")
        if to_delete:
            s3_client.delete_objects(
                Bucket=os.getenv('S3_BUCKET_NAME'),
                Delete={'Objects': to_delete, 'Quiet': False}
            )
            print(f"Deleted {len(to_delete)} old files.")
        else:
            print("No old files to delete.")
    except Exception as e:
        print(f"Error in deleting old files: {e}")

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

@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({'error': 'File too large. Max size is 500MB.'}), 413

@app.route('/upload', methods=['POST'])
def upload_file():
    global global_upload_counter, global_upload_size
    if pause_uploads_downloads:
        return jsonify({'error': 'Service temporarily unavailable due to high traffic.'}), 503

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
    
    file_data = file.read()
    if len(file_data) > app.config['MAX_CONTENT_LENGTH']:
        return jsonify({'error': 'File too large. Max size is 500MB.'}), 413

    global_upload_counter += 1
    global_upload_size += len(file_data) / (1024 * 1024)
    
    check_and_pause_uploads_downloads()
    
    access_code = generate_access_code()
    extension = secure_filename(file.filename).rsplit('.', 1)[-1] if '.' in file.filename else 'bin'
    created_at = datetime.utcnow()
    expires_at = created_at + timedelta(seconds=ttl_seconds)
    
    s3_client.put_object(
        Bucket=os.getenv('S3_BUCKET_NAME'),
        Key=access_code,
        Body=file_data,
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
    
    return jsonify({
        'message': 'File uploaded successfully',
        'key': access_code,
        'expiresAt': expires_at.isoformat() + 'Z',
        'maxDownloads': max_downloads,
        'ttlSeconds': ttl_seconds
    })

@app.route('/retrieve', methods=['GET'])
def retrieve_file():
    if pause_uploads_downloads:
        return jsonify({'error': 'Service temporarily unavailable due to high traffic.'}), 503

    if not rate_limit_ok(rate_limit_downloads, DOWNLOAD_RATE_LIMIT):
        return jsonify({'error': 'Too many downloads from this IP. Please slow down.'}), 429
    
    access_code = request.args.get('accessCode')
    if not access_code:
        return jsonify({'error': 'Access code is required'}), 400

    try:
        s3_response = s3_client.get_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
        encrypted_data = s3_response['Body'].read()
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
            s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
            return jsonify({'error': 'File expired.'}), 410

        if remaining_downloads <= 0:
            s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
            return jsonify({'error': 'Download limit reached.'}), 410

        response = Response(encrypted_data, mimetype='application/octet-stream')
        response.headers['X-IV'] = iv
        response.headers['X-SALT'] = salt
        response.headers['X-EXTENSION'] = metadata.get('extension', 'bin')
        response.headers['X-EXPIRES-AT'] = expires_at.isoformat() + 'Z'
        response.headers['X-REMAINING-DOWNLOADS'] = str(max(remaining_downloads - 1, 0))
        response.headers['X-MAX-DOWNLOADS'] = str(max_downloads)
        response.headers['Access-Control-Expose-Headers'] = 'X-IV, X-SALT, X-EXTENSION, X-EXPIRES-AT, X-REMAINING-DOWNLOADS, X-MAX-DOWNLOADS'

        if remaining_downloads <= 1:
            s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=access_code)
        else:
            updated_metadata = dict(metadata)
            updated_metadata['remaining_downloads'] = str(remaining_downloads - 1)
            updated_metadata['max_downloads'] = str(max_downloads)
            updated_metadata['created_at'] = (created_at.isoformat() + 'Z') if created_at else metadata.get('created_at', '')
            updated_metadata['ttl_seconds'] = str(ttl_seconds)
            updated_metadata['expires_at'] = expires_at.isoformat() + 'Z'
            s3_client.copy_object(
                Bucket=os.getenv('S3_BUCKET_NAME'),
                Key=access_code,
                CopySource={'Bucket': os.getenv('S3_BUCKET_NAME'), 'Key': access_code},
                Metadata=updated_metadata,
                MetadataDirective='REPLACE',
                ContentType=s3_response.get('ContentType', 'application/octet-stream'),
                ServerSideEncryption='AES256'
            )

        return response
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'NoSuchKey':
            return jsonify({'error': 'File not found.'}), 404
        print(f"Error: {e}")
        return Response("Server error", status=500)
    except Exception as e:
        print(f"Error: {e}")
        return Response("Server error", status=500)


@app.route('/')
def home():
    return "Hello", 200

# Schedule periodic tasks
scheduler = BackgroundScheduler()
scheduler.add_job(delete_old_files, 'interval', minutes=30)
scheduler.add_job(
    lambda: globals().update(global_upload_counter=0, global_upload_size=0),
    'interval',
    minutes=30
)
scheduler.start()

if __name__ == '__main__':
    port = 4000
    print(f"Server is running on port {port}.")
    app.run(host='0.0.0.0', port=port)
