import { useState, useEffect, useRef } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, File, FileText, CheckCircle, Share2, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decryptData, base64ToArrayBuffer, formatFileSize } from '@/utils/crypto';
import { CopyButton } from '@/components/CopyButton';
import { API_URL, formatExpiry, keepScreenAwake, parseSharedCredentials, readApiError, readWithProgress, saveUrlAs } from '@/lib/transfer';
import { cn } from '@/lib/utils';

interface DownloadedFileInfo {
    fileName: string;
    fileType: string;
    mimeType: string;
    size: number;
    extension: string;
    isText: boolean;
    remainingDownloads?: number;
    maxDownloads?: number;
    expiresAt?: string;
}

interface DownloadComponentProps {
    initialAccessCode?: string;
    initialSecretWord?: string;
    onFileRetrieved?: (accessCode: string, secretWord: string) => void;
}

type Phase = 'idle' | 'downloading' | 'decrypting';

const isLikelyUrl = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
};

const normalizeFileBase = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isLikelyUrl(trimmed)) {
        return 'file';
    }
    const withoutPath = trimmed.split(/[\\/]/).pop() || '';
    const withoutExt = withoutPath.replace(/\.[^.]+$/, '');
    return withoutExt || 'file';
};

const getPreviewKind = (extension: string) => {
    const ext = extension.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff'].includes(ext)) return 'image';
    return 'none';
};

const getMimeTypeFromExtension = (extension: string) => {
    const ext = extension.toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'bmp') return 'image/bmp';
    if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
    return 'application/octet-stream';
};

// Phone browsers either can't render a PDF in an iframe (Android) or show a
// single unscrollable page (iOS), so only embed where there is a real viewer.
const canEmbedPdf = () =>
    Boolean((navigator as any).pdfViewerEnabled) && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export default function DownloadComponent({ initialAccessCode = '', initialSecretWord = '', onFileRetrieved }: DownloadComponentProps) {
    const [takenAccessCode, setTakenAccessCode] = useState(initialAccessCode);
    const [takenSecretWord, setTakenSecretWord] = useState(initialSecretWord);
    const [fileBaseName, setFileBaseName] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [displayText, setDisplayText] = useState("");
    const [downloadedFileInfo, setDownloadedFileInfo] = useState<DownloadedFileInfo | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [shareFile, setShareFile] = useState<File | null>(null);
    const [previewKind, setPreviewKind] = useState<'image' | 'pdf' | 'none'>('none');

    const secretWordRef = useRef<HTMLInputElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);
    const resultHeadingRef = useRef<HTMLHeadingElement>(null);

    const { toast } = useToast();

    const loading = phase !== 'idle';

    const handleDownloadFile = () => {
        if (!downloadUrl || !downloadedFileInfo) return;
        saveUrlAs(downloadUrl, downloadedFileInfo.fileName);
    };

    const handleShareFile = async () => {
        if (!shareFile) return;
        try {
            await navigator.share({ files: [shareFile] });
        } catch (error) {
            // AbortError = the person closed the share sheet; nothing to report.
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                toast({ title: 'Could not open sharing', description: 'Use Download instead.', variant: 'destructive' });
            }
        }
    };

    const handleRetrieveFile = async (accessCode?: string, sw?: string) => {
        if (loading) return;
        const code = (accessCode ? accessCode : takenAccessCode).trim();
        const secW = (sw ? sw : takenSecretWord).trim();
        if (!code || !secW) {
            toast({
                title: "Missing Information",
                description: "Please enter both access code and secret word.",
                variant: "destructive"
            });
            return;
        }

        // Put the keyboard away so the progress and result are visible.
        (document.activeElement as HTMLElement | null)?.blur?.();

        setPhase('downloading');
        setProgress(0);
        setDisplayText("");
        setDownloadedFileInfo(null);
        setShareFile(null);
        setPreviewKind('none');
        setDownloadUrl((currentUrl) => {
            if (currentUrl) {
                window.URL.revokeObjectURL(currentUrl);
            }
            return null;
        });
        const releaseScreen = await keepScreenAwake();
        try {
            const response = await fetch(`${API_URL}/retrieve?accessCode=${encodeURIComponent(code)}&deferConsumption=1`, {
                method: 'GET',
                signal: AbortSignal.timeout(30 * 60 * 1000),
            });
            if (response.ok) {
                const ivB64 = response.headers.get('X-IV');
                const saltB64 = response.headers.get('X-SALT');
                const extension = response.headers.get('X-EXTENSION') || 'bin';
                const remainingDownloadsHeader = response.headers.get('X-REMAINING-DOWNLOADS');
                const maxDownloadsHeader = response.headers.get('X-MAX-DOWNLOADS');
                const expiresAtHeader = response.headers.get('X-EXPIRES-AT');

                if (!ivB64 || !saltB64) {
                    throw new Error("Missing encryption parameters");
                }

                const encryptedBuffer = await readWithProgress(response, setProgress);
                setPhase('decrypting');
                const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
                const salt = new Uint8Array(base64ToArrayBuffer(saltB64));

                const decryptedBuffer = await decryptData(encryptedBuffer, secW, iv, salt);
                navigator.sendBeacon(`${API_URL}/confirm-retrieval?accessCode=${encodeURIComponent(code)}`);

                const resolvedBaseName = normalizeFileBase(fileBaseName);
                const resolvedFileName = extension === 'txt' ? `file.${extension}` : `${resolvedBaseName}.${extension}`;
                const previewType = getPreviewKind(extension);
                const mimeType = extension === 'txt' ? 'text/plain' : getMimeTypeFromExtension(extension);
                const fileTypeLabel = extension === 'txt'
                    ? 'Text'
                    : previewType === 'pdf'
                        ? 'PDF document'
                        : previewType === 'image'
                            ? 'Image'
                            : `${extension.toUpperCase()} file`;
                const downloadInfo: DownloadedFileInfo = {
                    fileName: resolvedFileName,
                    fileType: fileTypeLabel,
                    mimeType,
                    size: decryptedBuffer.byteLength,
                    extension: extension,
                    isText: extension === 'txt',
                    remainingDownloads: remainingDownloadsHeader ? Number(remainingDownloadsHeader) : undefined,
                    maxDownloads: maxDownloadsHeader ? Number(maxDownloadsHeader) : undefined,
                    expiresAt: expiresAtHeader || undefined
                };

                if (extension === 'txt') {
                    const decoder = new TextDecoder();
                    const textContent = decoder.decode(decryptedBuffer);
                    setDisplayText(textContent);
                } else {
                    const blob = new Blob([decryptedBuffer], { type: mimeType });
                    const url = window.URL.createObjectURL(blob);
                    setPreviewKind(previewType);
                    setDownloadUrl(url);

                    // On phones the share sheet is how a file gets into Photos,
                    // Files or another app.
                    try {
                        const file = new window.File([blob], resolvedFileName, { type: mimeType });
                        if (navigator.canShare?.({ files: [file] })) setShareFile(file);
                    } catch {
                        // File sharing not supported; the Download button still works.
                    }

                    const autoDownloadUrl = window.URL.createObjectURL(
                        blob.slice(0, blob.size, 'application/octet-stream')
                    );
                    saveUrlAs(autoDownloadUrl, resolvedFileName);
                    setTimeout(() => window.URL.revokeObjectURL(autoDownloadUrl), 1000);
                }

                setDownloadedFileInfo(downloadInfo);
                onFileRetrieved?.(code, secW);
            } else {
                const errorText = await response.text();
                toast({
                    title: "Retrieval Failed",
                    description: readApiError(errorText, 'The server could not return this file.'),
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error during file retrieval:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "An error occurred",
                variant: "destructive"
            });
        } finally {
            releaseScreen();
            setPhase('idle');
        }
    };

    useEffect(() => {
        if (initialAccessCode && initialSecretWord) {
            setTakenAccessCode(initialAccessCode);
            setTakenSecretWord(initialSecretWord);
            handleRetrieveFile(initialAccessCode, initialSecretWord);
        }
    }, [initialAccessCode, initialSecretWord]);

    useEffect(() => {
        return () => {
            if (downloadUrl) {
                window.URL.revokeObjectURL(downloadUrl);
            }
        };
    }, [downloadUrl]);

    // Bring the result into view; on a phone it would otherwise land below the form.
    useEffect(() => {
        if (!downloadedFileInfo) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        resultRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        resultHeadingRef.current?.focus({ preventScroll: true });
    }, [downloadedFileInfo]);

    // Pasting a whole share link (or the CLI's download line) fills both fields.
    const handlePaste = (event: ClipboardEvent) => {
        const parsed = parseSharedCredentials(event.clipboardData?.getData('text') || '');
        if (!parsed) return;
        event.preventDefault();
        setTakenAccessCode(parsed.accessCode);
        setTakenSecretWord(parsed.secretWord);
    };

    const codeFieldProps = {
        className: 'font-mono',
        autoCapitalize: 'none',
        autoCorrect: 'off',
        autoComplete: 'off',
        spellcheck: false,
        onPaste: handlePaste,
    };

    const info = downloadedFileInfo;
    const lastDownload = info?.remainingDownloads === 0;

    return (
        <div className="space-y-4 sm:space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="size-5 shrink-0" aria-hidden="true" />
                        Download File
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            handleRetrieveFile();
                        }}
                    >
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="access-code" className="font-medium">Access code</Label>
                                <Input
                                    id="access-code"
                                    value={takenAccessCode}
                                    placeholder="a1b2"
                                    onInput={(e: any) => setTakenAccessCode(e.target.value)}
                                    enterKeyHint="next"
                                    onKeyDown={(e: KeyboardEvent) => {
                                        // "Next" on a phone keyboard moves on instead of submitting half a form.
                                        if (e.key === 'Enter' && !takenSecretWord) {
                                            e.preventDefault();
                                            secretWordRef.current?.focus();
                                        }
                                    }}
                                    {...codeFieldProps}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="secret-word" className="font-medium">Secret word</Label>
                                <Input
                                    id="secret-word"
                                    ref={secretWordRef}
                                    value={takenSecretWord}
                                    placeholder="K7M2QX"
                                    onInput={(e: any) => setTakenSecretWord(e.target.value)}
                                    enterKeyHint="go"
                                    {...codeFieldProps}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="file-name" className="font-medium">
                                Save as <span className="font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                                id="file-name"
                                value={fileBaseName}
                                placeholder="file"
                                onInput={(e: any) => setFileBaseName(e.target.value)}
                                onBlur={() => setFileBaseName(fileBaseName.trim() ? normalizeFileBase(fileBaseName) : '')}
                                enterKeyHint="go"
                                autoCapitalize="none"
                                autoCorrect="off"
                                autoComplete="off"
                                spellcheck={false}
                                aria-describedby="file-name-hint"
                            />
                            <p id="file-name-hint" className="text-xs text-muted-foreground">
                                The file extension is added for you.
                            </p>
                        </div>

                        {loading ? (
                            <div className="space-y-3" aria-live="polite">
                                <div
                                    role="progressbar"
                                    aria-label={phase === 'decrypting' ? 'Decrypting' : 'Downloading'}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={phase === 'downloading' && progress > 0 ? Math.round(progress * 100) : undefined}
                                    className="h-2 overflow-hidden rounded-full bg-muted"
                                >
                                    <div
                                        className={cn(
                                            'h-full rounded-full bg-primary transition-[width] duration-200 ease-out',
                                            (phase === 'decrypting' || progress === 0) && 'animate-pulse'
                                        )}
                                        style={{ width: phase === 'decrypting' || progress === 0 ? '100%' : `${Math.max(2, progress * 100)}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground">
                                        {phase === 'decrypting' ? 'Decrypting on your device…' : 'Downloading…'}
                                    </span>
                                    {phase === 'downloading' && progress > 0 && (
                                        <span className="font-medium tabular-nums">{Math.round(progress * 100)}%</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <Button
                                type="submit"
                                size="lg"
                                className="w-full"
                                disabled={!takenAccessCode.trim() || !takenSecretWord.trim()}
                            >
                                <Download className="size-4" aria-hidden="true" />
                                Retrieve File
                            </Button>
                        )}
                    </form>
                </CardContent>
            </Card>

            {info && (
                <Card ref={resultRef} className="scroll-mt-3">
                    <CardHeader>
                        <CardTitle ref={resultHeadingRef} tabIndex={-1} className="flex items-center gap-2 outline-hidden">
                            <CheckCircle className="size-5 shrink-0 text-green-600" aria-hidden="true" />
                            {info.isText ? 'Text retrieved' : 'File retrieved'}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground wrap-anywhere">
                            {info.isText ? '' : `${info.fileName} · `}{info.fileType} · {formatFileSize(info.size)}
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {info.isText ? (
                            <>
                                <Textarea
                                    value={displayText}
                                    aria-label="Retrieved text"
                                    className="min-h-48 resize-y bg-muted/60 font-mono sm:min-h-[300px]"
                                    readOnly
                                />
                                <CopyButton size="lg" className="w-full" value={displayText} label="Copy text">
                                    Copy text
                                </CopyButton>
                            </>
                        ) : (
                            <>
                                {previewKind === 'image' && downloadUrl && (
                                    <div className="rounded-lg bg-muted/60 p-2 sm:p-4">
                                        <img
                                            src={downloadUrl}
                                            alt={info.fileName}
                                            className="mx-auto max-h-[60dvh] max-w-full rounded-md object-contain outline-1 -outline-offset-1 outline-black/10 sm:max-h-[480px] dark:outline-white/10"
                                        />
                                    </div>
                                )}
                                {previewKind === 'pdf' && downloadUrl && canEmbedPdf() && (
                                    <div className="overflow-hidden rounded-lg border">
                                        <iframe
                                            src={downloadUrl}
                                            title={info.fileName}
                                            className="h-[520px] w-full bg-white"
                                        />
                                    </div>
                                )}
                                {previewKind === 'pdf' && downloadUrl && !canEmbedPdf() && (
                                    <div className="space-y-3 rounded-lg border border-dashed bg-muted/60 p-5 text-center">
                                        <File className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                                        <Button asChild variant="outline">
                                            <a href={downloadUrl} target="_blank" rel="noopener">
                                                <ExternalLink className="size-4" aria-hidden="true" />
                                                Open PDF
                                            </a>
                                        </Button>
                                    </div>
                                )}
                                {previewKind === 'none' && (
                                    <div className="space-y-2 rounded-lg border border-dashed bg-muted/60 p-5 text-center sm:p-8">
                                        <File className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                                        <p className="text-sm text-muted-foreground">
                                            No preview for this file type.
                                        </p>
                                    </div>
                                )}
                                <div className={cn('grid gap-2', shareFile && 'grid-cols-2')}>
                                    <Button size="lg" className="px-4" onClick={handleDownloadFile} disabled={!downloadUrl}>
                                        <Download className="size-4" aria-hidden="true" />
                                        Download
                                    </Button>
                                    {shareFile && (
                                        <Button size="lg" variant="outline" className="px-4" onClick={handleShareFile}>
                                            <Share2 className="size-4" aria-hidden="true" />
                                            Share
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}

                        {(info.remainingDownloads !== undefined || info.expiresAt) && (
                            <p className="text-sm text-muted-foreground">
                                {lastDownload
                                    ? 'That was the last allowed download. The file has been deleted from the server.'
                                    : <>
                                        {info.remainingDownloads !== undefined && (
                                            <>{info.remainingDownloads} of {info.maxDownloads ?? '—'} downloads left</>
                                        )}
                                        {info.remainingDownloads !== undefined && info.expiresAt && ' · '}
                                        {info.expiresAt && <>expires {formatExpiry(info.expiresAt)}</>}
                                    </>}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
