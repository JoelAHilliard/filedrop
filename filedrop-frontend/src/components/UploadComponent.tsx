import { useEffect, useRef, useState } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangle, File, Upload, FileText, CheckCircle, Info, Shield, Eye, EyeOff, Timer, Share2, Download as DownloadIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import QRCode from "react-qr-code";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { encryptData, arrayBufferToBase64, formatFileSize } from '@/utils/crypto';
import FileDropZone from '@/components/FileDropZone';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/CopyButton';
import { API_URL, buildShareLink, formatExpiry, keepScreenAwake, readApiError, uploadForm } from '@/lib/transfer';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const SECRET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_TTL_HOURS = 24;
const DEFAULT_MAX_DOWNLOADS = 5;

type Mode = 'file' | 'text';
type Phase = 'idle' | 'encrypting' | 'uploading' | 'finishing';

interface UploadResult {
    accessCode: string;
    secretWord: string;
    expiresAt: string;
    maxDownloads: number;
    ttlHours: number;
    name: string;
    size: number;
}

const clamp = (value: string, fallback: number, min: number, max: number) => {
    const parsed = Math.round(Number(value));
    if (value.trim() === '' || !Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
};

const formatTtl = (hours: number) => (hours >= 24 && hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`);

const PHASE_LABEL: Record<Phase, string> = {
    idle: '',
    encrypting: 'Encrypting on your device…',
    uploading: 'Uploading…',
    finishing: 'Finishing up…',
};

export default function UploadComponent() {
    const [mode, setMode] = useState<Mode>('file');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [inputText, setInputText] = useState('');
    const [dropzoneKey, setDropzoneKey] = useState(0);

    // Kept as raw strings while typing so the field can be cleared and retyped
    // on a phone keyboard; clamped on blur and again on upload.
    const [ttlInput, setTtlInput] = useState(String(DEFAULT_TTL_HOURS));
    const [maxDownloadsInput, setMaxDownloadsInput] = useState(String(DEFAULT_MAX_DOWNLOADS));
    const [burnAfterRead, setBurnAfterRead] = useState(true);

    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [showSecretWord, setShowSecretWord] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const resultHeadingRef = useRef<HTMLHeadingElement>(null);

    const { toast } = useToast();

    const busy = phase !== 'idle';
    const ttlHours = clamp(ttlInput, DEFAULT_TTL_HOURS, 1, 72);
    const maxDownloads = burnAfterRead ? 1 : clamp(maxDownloadsInput, DEFAULT_MAX_DOWNLOADS, 1, 100);
    const canUpload = mode === 'file' ? Boolean(selectedFile) : inputText !== '';
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    // The codes exist only on this screen, so bring them into view as soon as
    // they appear instead of leaving them below the fold.
    useEffect(() => {
        if (!result) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cardRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        resultHeadingRef.current?.focus({ preventScroll: true });
    }, [result]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const handleDropZoneChange = (files: File[]) => {
        if (files && files.length > 0) setSelectedFile(files[0]);
    };

    const resetUpload = () => {
        setResult(null);
        setShowSecretWord(false);
        setSelectedFile(null);
        setInputText('');
        setProgress(0);
        setDropzoneKey(prev => prev + 1); // Force dropzone reset
    };

    const handleUpload = async (event?: Event) => {
        event?.preventDefault();
        if (busy) return;

        if (mode === 'file') {
            if (!selectedFile) {
                toast({ title: "No File Selected", description: "Please select a file to upload.", variant: "destructive" });
                return;
            }
            if (selectedFile.size > MAX_FILE_SIZE) {
                toast({ title: "File Too Large", description: "File size exceeds the maximum limit of 500MB.", variant: "destructive" });
                return;
            }
        } else if (inputText === '') {
            toast({ title: "No Content", description: "Please enter some text to upload.", variant: "destructive" });
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const throwIfCancelled = () => {
            if (controller.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
        };

        setProgress(0);
        setPhase('encrypting');
        const releaseScreen = await keepScreenAwake();

        try {
            const secretWord = Array.from(crypto.getRandomValues(new Uint8Array(6)),
                byte => SECRET_ALPHABET[byte & 31]).join('');

            const isFile = mode === 'file' && selectedFile;
            // Text is encoded as UTF-8 so emoji, accents and the "smart"
            // punctuation phone keyboards insert survive the round trip.
            const plain = isFile ? await selectedFile.arrayBuffer() : new TextEncoder().encode(inputText).buffer;
            const name = isFile ? selectedFile.name : 'file.txt';
            const type = isFile ? selectedFile.type : 'text/plain';
            throwIfCancelled();

            const { encryptedBuffer, iv, salt } = await encryptData(plain, secretWord);
            throwIfCancelled();

            const formData = new FormData();
            formData.append('file', new Blob([encryptedBuffer]), name);
            formData.append('type', type);
            formData.append('iv', arrayBufferToBase64(iv));
            formData.append('salt', arrayBufferToBase64(salt));
            formData.append('maxDownloads', String(maxDownloads));
            formData.append('ttlSeconds', String(ttlHours * 3600));

            setPhase('uploading');
            const response = await uploadForm(`${API_URL}/upload`, formData, {
                signal: controller.signal,
                onProgress: (fraction) => {
                    setProgress(fraction);
                    if (fraction >= 1) setPhase('finishing');
                },
            });

            if (!response.ok) {
                throw new Error(readApiError(response.body, 'The server rejected the upload. Please try again.'));
            }

            const data = JSON.parse(response.body);
            setShowSecretWord(false);
            setResult({
                accessCode: data.key,
                secretWord,
                expiresAt: data.expiresAt || '',
                maxDownloads,
                ttlHours,
                name: isFile ? name : 'Text snippet',
                size: plain.byteLength,
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                toast({ title: 'Upload cancelled' });
            } else {
                console.error('Error during upload:', error);
                toast({
                    title: 'Upload Failed',
                    description: error instanceof Error && error.message ? error.message : 'An error occurred during upload.',
                    variant: 'destructive',
                });
            }
        } finally {
            releaseScreen();
            abortRef.current = null;
            setPhase('idle');
        }
    };

    const shareLink = result ? buildShareLink(result.accessCode, result.secretWord) : '';

    const handleNativeShare = async () => {
        try {
            await navigator.share({ title: 'Filedrop', text: 'Encrypted file via Filedrop', url: shareLink });
        } catch (error) {
            // AbortError = the person closed the share sheet; nothing to report.
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                toast({ title: 'Could not open sharing', description: 'Use Copy link instead.', variant: 'destructive' });
            }
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            <Card ref={cardRef} className="scroll-mt-3">
                {result ? (
                    <>
                        <CardHeader>
                            <CardTitle ref={resultHeadingRef} tabIndex={-1} className="flex items-center gap-2 outline-hidden">
                                <CheckCircle className="size-5 shrink-0 text-green-600" aria-hidden="true" />
                                Ready to share
                            </CardTitle>
                            <p className="text-sm text-muted-foreground wrap-anywhere">
                                {result.name} · {formatFileSize(result.size)} · encrypted
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className={cn('grid gap-2', canNativeShare && 'grid-cols-2')}>
                                {canNativeShare && (
                                    <Button size="lg" className="px-4" onClick={handleNativeShare}>
                                        <Share2 className="size-4" aria-hidden="true" />
                                        Share link
                                    </Button>
                                )}
                                <CopyButton
                                    size="lg"
                                    variant={canNativeShare ? 'outline' : 'default'}
                                    className="px-4"
                                    value={shareLink}
                                    label="Copy share link"
                                >
                                    Copy link
                                </CopyButton>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="given-access-code" className="font-medium">Access code</Label>
                                    <div className="flex gap-2">
                                        <output
                                            id="given-access-code"
                                            className="flex h-(--control-h) min-w-0 flex-1 items-center rounded-md border border-input bg-background px-3 font-mono text-base tracking-widest select-all"
                                        >
                                            {result.accessCode}
                                        </output>
                                        <CopyButton size="icon" variant="outline" className="shrink-0" value={result.accessCode} label="Copy access code" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="given-secret-word" className="font-medium">Secret word</Label>
                                    <div className="flex gap-2">
                                        <output
                                            id="given-secret-word"
                                            aria-label={showSecretWord ? undefined : 'Hidden'}
                                            className={cn(
                                                'flex h-(--control-h) min-w-0 flex-1 items-center rounded-md border border-input bg-background px-3 font-mono text-base tracking-widest',
                                                showSecretWord && 'select-all'
                                            )}
                                        >
                                            {showSecretWord ? result.secretWord : '•'.repeat(result.secretWord.length)}
                                        </output>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="outline"
                                            className="shrink-0"
                                            aria-label={showSecretWord ? 'Hide secret word' : 'Show secret word'}
                                            aria-pressed={showSecretWord}
                                            onClick={() => setShowSecretWord(!showSecretWord)}
                                        >
                                            {showSecretWord ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                                        </Button>
                                        <CopyButton size="icon" variant="outline" className="shrink-0" value={result.secretWord} label="Copy secret word" />
                                    </div>
                                </div>
                            </div>

                            <dl className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg border p-3">
                                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <DownloadIcon className="size-3.5" aria-hidden="true" />
                                        Downloads
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {result.maxDownloads === 1 ? '1, then deleted' : `Up to ${result.maxDownloads}`}
                                    </dd>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Timer className="size-3.5" aria-hidden="true" />
                                        Expires
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {result.expiresAt ? formatExpiry(result.expiresAt) : `In ${result.ttlHours} hours`}
                                    </dd>
                                </div>
                            </dl>

                            <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/60 p-4 sm:p-6">
                                <div className="rounded-md bg-white p-3 outline-1 outline-black/10">
                                    <QRCode size={148} value={shareLink} />
                                </div>
                                <p className="text-center text-sm text-muted-foreground">Scan with another device to download</p>
                            </div>

                            <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Save these now</AlertTitle>
                                <AlertDescription>
                                    Filedrop can't show the access code or secret word again. If you lose them, the file cannot be recovered.
                                </AlertDescription>
                            </Alert>

                            <Button variant="outline" className="w-full" onClick={resetUpload}>
                                <Upload className="size-4" aria-hidden="true" />
                                Upload another
                            </Button>
                        </CardContent>
                    </>
                ) : (
                    <>
                        <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle className="flex min-w-0 items-center gap-2">
                                    {mode === 'file' ? <File className="size-5 shrink-0" aria-hidden="true" /> : <FileText className="size-5 shrink-0" aria-hidden="true" />}
                                    {mode === 'file' ? 'Upload File' : 'Upload Text'}
                                </CardTitle>
                                <div role="group" aria-label="What to upload" className="flex shrink-0 rounded-md bg-muted p-1">
                                    {(['file', 'text'] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            disabled={busy}
                                            aria-pressed={mode === option}
                                            onClick={() => setMode(option)}
                                            className={cn(
                                                'relative h-9 rounded-sm px-3.5 text-sm font-medium capitalize after:absolute after:inset-x-0 after:-inset-y-1 transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-fine:h-7 pointer-fine:px-3',
                                                mode === option ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-4" onSubmit={handleUpload}>
                                {mode === 'file' ? (
                                    <FileDropZone
                                        onChange={handleDropZoneChange}
                                        resetKey={dropzoneKey}
                                        selectedFile={selectedFile}
                                        disabled={busy}
                                        onRemoveFile={() => {
                                            setSelectedFile(null);
                                            setDropzoneKey(prev => prev + 1);
                                        }}
                                        formatFileSize={formatFileSize}
                                    />
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <Label htmlFor="text-input" className="font-medium">Text content</Label>
                                            {inputText && (
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {inputText.length.toLocaleString()} characters
                                                </span>
                                            )}
                                        </div>
                                        <Textarea
                                            id="text-input"
                                            value={inputText}
                                            disabled={busy}
                                            onInput={(e: any) => setInputText(e.target.value)}
                                            placeholder="Paste or type the text to share…"
                                            className="min-h-40 resize-y sm:min-h-[200px]"
                                        />
                                    </div>
                                )}

                                <fieldset disabled={busy} aria-labelledby="access-controls-title" className="min-w-0 space-y-3 rounded-lg border p-3 sm:space-y-4 sm:p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <h3 id="access-controls-title" className="text-sm font-medium">Access controls</h3>
                                            <p className="hidden text-xs text-muted-foreground sm:block">Set expiry and download limits before upload.</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                                            <Timer className="size-3.5" aria-hidden="true" />
                                            <span>{formatTtl(ttlHours)} TTL</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="ttl-hours" className="text-sm">Expiry (hours)</Label>
                                            <Input
                                                id="ttl-hours"
                                                type="number"
                                                inputMode="numeric"
                                                enterKeyHint="done"
                                                min={1}
                                                max={72}
                                                value={ttlInput}
                                                aria-describedby="ttl-hint"
                                                onInput={(e: any) => setTtlInput(e.target.value)}
                                                onBlur={() => setTtlInput(String(ttlHours))}
                                            />
                                            <p id="ttl-hint" className="text-xs text-muted-foreground">Up to 72 (3 days)</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="max-downloads" className="text-sm">Max downloads</Label>
                                            <Input
                                                id="max-downloads"
                                                type="number"
                                                inputMode="numeric"
                                                enterKeyHint="done"
                                                min={1}
                                                max={100}
                                                value={burnAfterRead ? '1' : maxDownloadsInput}
                                                disabled={burnAfterRead}
                                                aria-describedby="max-downloads-hint"
                                                onInput={(e: any) => setMaxDownloadsInput(e.target.value)}
                                                onBlur={() => setMaxDownloadsInput(String(clamp(maxDownloadsInput, DEFAULT_MAX_DOWNLOADS, 1, 100)))}
                                            />
                                            <p id="max-downloads-hint" className="text-xs text-muted-foreground">
                                                {burnAfterRead ? 'Set by burn option' : 'Up to 100'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            id="burn-after-read"
                                            checked={burnAfterRead}
                                            onCheckedChange={(value) => setBurnAfterRead(Boolean(value))}
                                        />
                                        <Label htmlFor="burn-after-read" className="cursor-pointer py-2 text-sm">
                                            Burn after first download
                                        </Label>
                                    </div>
                                </fieldset>

                                {busy ? (
                                    <div className="space-y-3" aria-live="polite">
                                        <div
                                            role="progressbar"
                                            aria-label={PHASE_LABEL[phase]}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={phase === 'encrypting' ? undefined : Math.round(progress * 100)}
                                            className="h-2 overflow-hidden rounded-full bg-muted"
                                        >
                                            <div
                                                className={cn(
                                                    'h-full rounded-full bg-primary transition-[width] duration-200 ease-out',
                                                    phase === 'encrypting' && 'animate-pulse'
                                                )}
                                                style={{ width: phase === 'encrypting' ? '100%' : `${Math.max(2, progress * 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-muted-foreground">{PHASE_LABEL[phase]}</span>
                                            {phase !== 'encrypting' && (
                                                <span className="font-medium tabular-nums">{Math.round(progress * 100)}%</span>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full"
                                            disabled={phase === 'finishing'}
                                            onClick={() => abortRef.current?.abort()}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <Button type="submit" size="lg" className="w-full" disabled={!canUpload}>
                                        <Upload className="size-4" aria-hidden="true" />
                                        {mode === 'file' ? 'Encrypt & Upload File' : 'Encrypt & Upload Text'}
                                    </Button>
                                )}
                            </form>
                        </CardContent>
                    </>
                )}
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Info className="size-5 shrink-0" aria-hidden="true" />
                        Security Features
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
                        <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
                            <Shield className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                            <div className="min-w-0">
                                <h3 className="text-sm font-medium">AES-256 Encryption</h3>
                                <p className="text-xs text-muted-foreground">End-to-end encryption</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
                            <Timer className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                            <div className="min-w-0">
                                <h3 className="text-sm font-medium">Custom TTL</h3>
                                <p className="text-xs text-muted-foreground">Up to 3 days</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
                            <DownloadIcon className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                            <div className="min-w-0">
                                <h3 className="text-sm font-medium">Download Limits</h3>
                                <p className="text-xs text-muted-foreground">Control access frequency</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
