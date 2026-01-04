type DerivedKeys = {
    encryptionKey: CryptoKey;
    macKey: CryptoKey;
};

async function deriveKeys(secretWord: string, salt: Uint8Array, keyUsages: KeyUsage[]): Promise<DerivedKeys> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secretWord),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const keyBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        512
    );
    const keyBytes = new Uint8Array(keyBits);
    const encryptionKeyBytes = keyBytes.slice(0, 32);
    const macKeyBytes = keyBytes.slice(32);
    const encryptionKey = await crypto.subtle.importKey(
        'raw',
        encryptionKeyBytes,
        { name: 'AES-CBC' },
        false,
        keyUsages
    );
    const macKey = await crypto.subtle.importKey(
        'raw',
        macKeyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
    return { encryptionKey, macKey };
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export async function encryptData(buffer: ArrayBuffer, secretWord: string) {
    if (!window.crypto?.subtle) {
        throw new Error('Web Crypto API is not available. Please use HTTPS or update your browser.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const { encryptionKey, macKey } = await deriveKeys(secretWord, salt, ['encrypt']);
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        encryptionKey,
        buffer
    );
    const macPayload = concatUint8Arrays([iv, new Uint8Array(encryptedBuffer)]);
    const hmac = await crypto.subtle.sign('HMAC', macKey, macPayload);
    return { encryptedBuffer, iv, salt, hmac };
}

export async function decryptData(
    encryptedBuffer: ArrayBuffer,
    secretWord: string,
    iv: Uint8Array,
    salt: Uint8Array,
    hmac?: Uint8Array
) {
    if (!window.crypto?.subtle) {
        throw new Error('Web Crypto API is not available. Please use HTTPS or update your browser.');
    }
    const { encryptionKey, macKey } = await deriveKeys(secretWord, salt, ['decrypt']);
    if (hmac) {
        const macPayload = concatUint8Arrays([iv, new Uint8Array(encryptedBuffer)]);
        const valid = await crypto.subtle.verify('HMAC', macKey, hmac, macPayload);
        if (!valid) {
            throw new Error('Integrity check failed. The secret word may be incorrect or the file was tampered with.');
        }
    }
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        encryptionKey,
        encryptedBuffer
    );
    return decryptedBuffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => binary += String.fromCharCode(b));
    return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for(let i = 0; i < len; i++){
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
