import io
import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError, ReadTimeoutError
from datetime import datetime

os.environ.update({
    'AWS_EC2_METADATA_DISABLED': 'true',
    'CLOUDFLARE_R2_ENDPOINT': 'http://localhost',
    'S3_ACCESS_Key': 'test',
    'S3_SECRET_ACCESS_KEY': 'test',
    'S3_BUCKET_NAME': 'test',
})

from backend import app as backend


class RetrievalTest(unittest.TestCase):
    def setUp(self):
        backend.rate_limit_uploads.clear()
        backend.rate_limit_downloads.clear()
        backend.rate_limit_confirmations.clear()

    def test_streams_in_chunks_and_closes_on_disconnect(self):
        class ChunkedBody(io.BytesIO):
            def read(self, size=-1):
                self.assert_bounded(size)
                return super().read(size)

            def assert_bounded(self, size):
                assert 0 < size <= 256 * 1024, size

        body = ChunkedBody(b'x' * (1024 * 1024))
        with patch.object(backend.s3_client, 'get_object', return_value={
            'Body': body,
            'ContentLength': 1024 * 1024,
            'Metadata': {'expires_at': '2099-01-01T00:00:00Z'},
        }):
            response = backend.app.test_client().get('/retrieve?accessCode=abc&deferConsumption=1', buffered=False)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content_length, 1024 * 1024)
            self.assertEqual(body.tell(), 256 * 1024)
            response.close()
            self.assertTrue(body.closed)

    def test_expired_and_exhausted_files_are_not_read(self):
        for metadata in [
            {'expires_at': '2000-01-01T00:00:00Z'},
            {'expires_at': '2099-01-01T00:00:00Z', 'remaining_downloads': '0'},
        ]:
            body = io.BytesIO(b'encrypted')
            with patch.object(body, 'read', side_effect=AssertionError('Must not read body')), \
                 patch.object(backend.s3_client, 'get_object', return_value={'Body': body, 'Metadata': metadata}), \
                 patch.object(backend.s3_client, 'delete_object') as delete:
                response = backend.app.test_client().get('/retrieve?accessCode=abc&deferConsumption=1')
                self.assertEqual(response.status_code, 410)
                self.assertTrue(body.closed)
                delete.assert_called_once()

    def test_cleanup_paginates_and_checks_delete_errors(self):
        page = {'Contents': [{'Key': 'abc', 'LastModified': datetime(2000, 1, 1)}]}
        with patch.object(backend.s3_client, 'get_paginator') as paginator, \
             patch.object(backend.s3_client, 'head_object', return_value={'Metadata': {}}), \
             patch.object(backend.s3_client, 'delete_objects', return_value={}) as delete:
            paginator.return_value.paginate.return_value = [page, page]
            backend.delete_old_files()
            self.assertEqual(delete.call_count, 2)
            delete.return_value = {'Errors': [{'Code': 'AccessDenied'}]}
            with self.assertRaises(RuntimeError):
                backend.delete_old_files()

    def test_uploads_do_not_globally_pause_but_keep_ip_limit(self):
        client = backend.app.test_client()
        with patch.object(backend.s3_client, 'put_object', return_value={}):
            for index in range(51):
                response = client.post('/upload', environ_overrides={'REMOTE_ADDR': f'192.0.2.{index}'}, data={
                    'file': (io.BytesIO(b'encrypted'), 'file.bin'),
                    'secretWord': 'secret', 'iv': 'aXY=', 'salt': 'c2FsdA==',
                })
                self.assertEqual(response.status_code, 200)
        with patch.object(backend.s3_client, 'get_object', side_effect=ClientError(
            {'Error': {'Code': 'NoSuchKey'}}, 'GetObject'
        )):
            self.assertEqual(client.get('/retrieve?accessCode=absent').status_code, 404)
        backend.rate_limit_uploads['127.0.0.1'] = (datetime.now().timestamp(), backend.UPLOAD_RATE_LIMIT)
        self.assertEqual(client.post('/upload').status_code, 429)

    def test_storage_requests_close_connections_and_bound_stalls(self):
        self.assertEqual(backend.s3_client.meta.config.read_timeout, 10)

        def inspect_request(request, **kwargs):
            self.assertEqual(request.headers['Connection'], b'close')
            raise RuntimeError('request inspected without network')

        events = backend.s3_client.meta.events
        events.register('before-send.s3.PutObject', inspect_request)
        try:
            with self.assertRaisesRegex(RuntimeError, 'request inspected'):
                backend.s3_client.put_object(Bucket='test', Key='test', Body=b'test')
        finally:
            events.unregister('before-send.s3.PutObject', inspect_request)

    def test_storage_timeout_returns_504(self):
        with patch.object(backend.s3_client, 'get_object', side_effect=ReadTimeoutError(endpoint_url='http://localhost')):
            response = backend.app.test_client().get('/retrieve?accessCode=abc')
            self.assertEqual(response.status_code, 504)

    def test_legacy_read_failure_does_not_consume(self):
        body = io.BytesIO(b'encrypted')
        with patch.object(body, 'read', side_effect=ReadTimeoutError(endpoint_url='http://localhost')), \
             patch.object(backend.s3_client, 'get_object', return_value={
                 'Body': body, 'Metadata': {'expires_at': '2099-01-01T00:00:00Z'},
             }), patch.object(backend, 'consume_download') as consume:
            response = backend.app.test_client().get('/retrieve?accessCode=abc')
            self.assertEqual(response.status_code, 504)
            self.assertTrue(body.closed)
            consume.assert_not_called()

    def test_upload_retries_access_code_collisions(self):
        collision = ClientError({'Error': {'Code': 'PreconditionFailed'}}, 'PutObject')
        bodies = []

        def upload(**kwargs):
            bodies.append(kwargs['Body'].read())
            if len(bodies) == 1:
                raise collision
            return {}

        with patch.object(backend, 'generate_access_code', side_effect=['abcd', 'ef01']), \
             patch.object(backend.s3_client, 'put_object', side_effect=upload) as put:
            response = backend.app.test_client().post('/upload', data={
                'file': (io.BytesIO(b'encrypted'), 'file.bin'),
                'secretWord': 'secret',
                'iv': 'aXY=',
                'salt': 'c2FsdA==',
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['key'], 'ef01')
        self.assertEqual(put.call_count, 2)
        self.assertEqual(bodies, [b'encrypted', b'encrypted'])

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
            self.assertEqual(response.data, b'encrypted')
            response.close()
            delete.assert_not_called()

            response = client.post('/confirm-retrieval?accessCode=abc')
            self.assertEqual(response.status_code, 200)
            delete.assert_called_once()


if __name__ == '__main__':
    unittest.main()
