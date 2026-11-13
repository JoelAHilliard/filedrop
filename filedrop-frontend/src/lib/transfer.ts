export const API_URL = 'https://fd.up.railway.app';

/** Pull a human-readable message out of an API error body ({"error": "..."} or plain text). */
export function readApiError(body: string, fallback: string): string {
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === 'string') return parsed.error;
    } catch {
        // not JSON
    }
    const text = body.trim();
    return text && text.length < 200 && !text.startsWith('<') ? text : fallback;
}

export function buildShareLink(accessCode: string, secretWord: string): string {
    return `${window.location.origin}/#ac=${encodeURIComponent(accessCode)}&sw=${encodeURIComponent(secretWord)}`;
}

/**
 * Recognise a pasted share link (…/#ac=CODE&sw=SECRET) or the CLI's
 * `filedrop download CODE SECRET` line, so people don't have to split it by hand.
 */
export function parseSharedCredentials(text: string): { accessCode: string; secretWord: string } | null {
    const ac = text.match(/[#?&]ac=([^&#\s]+)/);
    const sw = text.match(/[#?&]sw=([^&#\s]+)/);
    if (ac && sw) {
        try {
            return { accessCode: decodeURIComponent(ac[1]), secretWord: decodeURIComponent(sw[1]) };
        } catch {
            return { accessCode: ac[1], secretWord: sw[1] };
        }
    }
    const cli = text.match(/filedrop\s+download\s+(\S+)\s+(\S+)/);
    if (cli) return { accessCode: cli[1], secretWord: cli[2] };
    return null;
}

interface UploadOptions {
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
}

/**
 * POST a form with upload progress. fetch() can't report upload progress, and a
 * bare spinner is not enough feedback for a large file on a phone connection.
 */
export function uploadForm(url: string, form: FormData, { onProgress, signal, timeoutMs = 30 * 60 * 1000 }: UploadOptions = {}) {
    return new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.timeout = timeoutMs;
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
        };
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
        xhr.onerror = () => reject(new Error('Network error. Check your connection and try again.'));
        xhr.ontimeout = () => reject(new Error('The upload timed out. Try again on a faster connection.'));
        xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
        if (signal) {
            if (signal.aborted) {
                reject(new DOMException('Upload cancelled', 'AbortError'));
                return;
            }
            signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }
        xhr.send(form);
    });
}

/** Read a response body while reporting progress, without holding a second copy of it. */
export async function readWithProgress(response: Response, onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
    const total = Number(response.headers.get('Content-Length')) || 0;
    if (!response.body || !total) return response.arrayBuffer();

    const reader = response.body.getReader();
    let buffer = new Uint8Array(total);
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.length > buffer.length) {
            const grown = new Uint8Array(Math.max(buffer.length * 2, received + value.length));
            grown.set(buffer.subarray(0, received));
            buffer = grown;
        }
        buffer.set(value, received);
        received += value.length;
        onProgress(Math.min(1, received / total));
    }
    return received === buffer.length ? buffer.buffer : buffer.slice(0, received).buffer;
}

/** Keep the screen on during a long transfer; phones suspend the tab when they sleep. */
export async function keepScreenAwake(): Promise<() => void> {
    try {
        const lock = await (navigator as any).wakeLock?.request('screen');
        return () => {
            lock?.release?.().catch(() => {});
        };
    } catch {
        return () => {};
    }
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Older browsers / non-secure contexts
        try {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand('copy');
            area.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

/**
 * Save a blob/object URL as a file. The router intercepts every same-origin
 * link click (blob: URLs count as same-origin), cancels it and tries to
 * navigate to it, so the click must not bubble up to the router.
 */
export function saveUrlAs(url: string, fileName: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    link.addEventListener('click', (event) => event.stopPropagation());
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export function formatExpiry(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
