// Run Vite first. Install playwright-core separately; point NODE_PATH to its node_modules.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.addInitScript(() => localStorage.setItem('popupShown', 'true'));
        await page.route('**/bip39.txt', route => route.fulfill({ body: 'testword' }));
        let uploads = 0;
        let uploadedForm;
        await page.route('https://fd.up.railway.app/**', async route => {
            uploads++;
            uploadedForm = await new Request('http://localhost/upload', {
                method: 'POST', headers: route.request().headers(),
                body: route.request().postDataBuffer(),
            }).formData();
            assert.equal(uploadedForm.get('secretWord'), null);
            return route.fulfill({ json: { key: 'abcd' } });
        });
        await page.goto(process.env.TEST_URL || 'http://localhost:5173');
        await page.getByRole('button', { name: 'Text', exact: true }).click();
        await page.getByPlaceholder('Enter your text here...').fill('test');
        await page.evaluate(() => {
            window.originalEncrypt = crypto.subtle.encrypt;
            crypto.subtle.encrypt = async () => { throw new Error('Test encryption failure'); };
        });
        await page.getByRole('button', { name: 'Upload Text', exact: true }).click();
        await page.getByText('Test encryption failure', { exact: true }).waitFor();
        assert(await page.getByRole('button', { name: 'Upload Text', exact: true }).isVisible());
        assert.equal(uploads, 0);

        await page.evaluate(() => { crypto.subtle.encrypt = window.originalEncrypt; });
        await page.getByRole('button', { name: 'Upload Text', exact: true }).click();
        await page.getByRole('button', { name: 'Upload Another', exact: true }).waitFor();
        assert.equal(uploads, 1);
        const secret = await page.locator('input[type=password][readonly]').inputValue();
        assert.match(secret, /^[A-HJ-NP-Z2-9]{6}$/);
        await page.getByRole('button', { name: 'Copy Share Link', exact: true }).first().click();
        const shareLink = await page.evaluate(() => navigator.clipboard.readText());
        assert.equal(new URL(shareLink).search, '');
        assert.equal(new URLSearchParams(new URL(shareLink).hash.slice(1)).get('sw'), secret);

        const encrypted = Buffer.from(await uploadedForm.get('file').arrayBuffer());
        const iv = uploadedForm.get('iv');
        const salt = uploadedForm.get('salt');

        await page.getByRole('button', { name: 'Upload Another', exact: true }).click();
        await page.getByRole('button', { name: 'File', exact: true }).click();
        await page.locator('input[type=file]').setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
        await page.evaluate(() => {
            window.originalFileArrayBuffer = File.prototype.arrayBuffer;
            File.prototype.arrayBuffer = async () => { throw new Error('Test file read failure'); };
        });
        await page.getByRole('button', { name: 'Upload File', exact: true }).click();
        await page.getByText('Test file read failure', { exact: true }).waitFor();
        assert(await page.getByRole('button', { name: 'Upload File', exact: true }).isVisible());
        assert.equal(uploads, 1);

        await page.evaluate(() => { File.prototype.arrayBuffer = window.originalFileArrayBuffer; });
        await page.getByRole('button', { name: 'Upload File', exact: true }).click();
        await page.getByRole('button', { name: 'Upload Another', exact: true }).waitFor();
        assert.equal(uploads, 2);
        const fileSecret = await page.locator('input[type=password][readonly]').inputValue();
        assert.match(fileSecret, /^[A-HJ-NP-Z2-9]{6}$/);

        await page.unroute('https://fd.up.railway.app/**');
        await page.route('https://fd.up.railway.app/**', route => {
            assert(!route.request().url().includes(secret));
            if (route.request().url().includes('/retrieve?')) {
                return route.fulfill({ body: encrypted, headers: {
                    'Content-Type': 'application/octet-stream',
                    'Access-Control-Expose-Headers': 'X-IV, X-SALT, X-EXTENSION',
                    'X-IV': iv, 'X-SALT': salt, 'X-EXTENSION': 'txt',
                } });
            }
            return route.fulfill({ json: {} });
        });
        const base = process.env.TEST_URL || 'http://localhost:5173';
        for (const delimiter of ['#', '?']) {
            await page.goto(`${base}/${delimiter}ac=abcd&sw=${secret}`);
            await page.locator('textarea[readonly]').filter({ visible: true }).waitFor();
            assert.equal(await page.locator('textarea[readonly]').inputValue(), 'test');
        }
        assert.deepEqual(pageErrors, []);
        console.log('PASS: upload error recovery, secret-free ciphertext uploads, random secrets, fragment links, and new/legacy link decryption.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
