// Run Vite first. Install playwright-core separately; point NODE_PATH to its node_modules.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true });
    try {
        const page = await browser.newPage();
        await page.addInitScript(() => localStorage.setItem('popupShown', 'true'));
        await page.route('**/bip39.txt', route => route.fulfill({ body: 'testword' }));
        let uploads = 0;
        await page.route('https://fd.up.railway.app/**', route => {
            uploads++;
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

        await page.getByRole('button', { name: 'Upload Another', exact: true }).click();
        await page.getByRole('button', { name: 'File', exact: true }).click();
        await page.locator('input[type=file]').setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
        await page.evaluate(() => {
            File.prototype.arrayBuffer = async () => { throw new Error('Test file read failure'); };
        });
        await page.getByRole('button', { name: 'Upload File', exact: true }).click();
        await page.getByText('Test file read failure', { exact: true }).waitFor();
        assert(await page.getByRole('button', { name: 'Upload File', exact: true }).isVisible());
        assert.equal(uploads, 1);
        console.log('PASS: encryption/read failures clear spinner; successful upload still works.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
