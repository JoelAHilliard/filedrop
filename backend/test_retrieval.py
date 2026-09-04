import io
import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError

os.environ.update({
    'AWS_EC2_METADATA_DISABLED': 'true',
    'CLOUDFLARE_R2_ENDPOINT': 'http://localhost',
    'S3_ACCESS_Key': 'test',
    'S3_SECRET_ACCESS_KEY': 'test',
    'S3_BUCKET_NAME': 'test',
})

from backend import app as backend

backend.scheduler.shutdown(wait=False)


class RetrievalTest(unittest.TestCase):
    def test_upload_retries_access_code_collisions(self):
        collision = ClientError({'Error': {'Code': 'PreconditionFailed'}}, 'PutObject')
        backend.rate_limit_uploads.clear()
        backend.pause_uploads_downloads = False

        with patch.object(backend, 'generate_access_code', side_effect=['abcd', 'ef01']), \
             patch.object(backend.s3_client, 'put_object', side_effect=[collision, {}]) as put:
            response = backend.app.test_client().post('/upload', data={
                'file': (io.BytesIO(b'encrypted'), 'file.bin'),
                'secretWord': 'secret',
                'iv': 'aXY=',
                'salt': 'c2FsdA==',
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['key'], 'ef01')
        self.assertEqual(put.call_count, 2)

    def test_download_is_consumed_only_after_confirmation(self):
        metadata = {
            'iv': 'aXY=',
            'salt': 'c2FsdA==',
            'remaining_downloads': '1',
            'max_downloads': '1',
            'expires_at': '2099-01-01T00:00:00Z',
        }
        backend.rate_limit_downloads.clear()
        backend.rate_limit_confirmations.clear()

        with patch.object(backend.s3_client, 'get_object', return_value={
            'Body': io.BytesIO(b'encrypted'),
            'Metadata': metadata,
            'ContentType': 'application/octet-stream',
        }), patch.object(backend.s3_client, 'head_object', return_value={
            'Metadata': metadata,
            'ContentType': 'application/octet-stream',
        }), patch.object(backend.s3_client, 'delete_object') as delete:
            client = backend.app.test_client()
            response = client.get('/retrieve?accessCode=abc&deferConsumption=1')
            self.assertEqual(response.status_code, 200)
            delete.assert_not_called()

            response = client.post('/confirm-retrieval?accessCode=abc')
            self.assertEqual(response.status_code, 200)
            delete.assert_called_once()


if __name__ == '__main__':
    unittest.main()
