export async function encryptData(buffer: ArrayBuffer, secretWord: string) {
    if (!window.crypto?.subtle) {
        throw new Error('Web Crypto API is not available. Please use HTTPS or update your browser.');
    }
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secretWord),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-CBC', length: 256 },
        true,
        ['encrypt']
    );
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        key,
        buffer
    );
    return { encryptedBuffer, iv, salt };
}

export async function decryptData(encryptedBuffer: ArrayBuffer, secretWord: string, iv: Uint8Array, salt: Uint8Array) {
    if (!window.crypto?.subtle) {
        throw new Error('Web Crypto API is not available. Please use HTTPS or update your browser.');
    }
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secretWord),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-CBC', length: 256 },
        true,
        ['decrypt']
    );
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        key,
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

export function str2ab(str: string): ArrayBuffer {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}