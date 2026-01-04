import { useState, useEffect } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, File, FileText, CheckCircle, Copy, Shield, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decryptData, base64ToArrayBuffer, formatFileSize } from '@/utils/crypto';

interface DownloadedFileInfo {
    fileName: string;
    fileType: string;
    size: number;
    extension: string;
    downloadTime: string;
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

export default function DownloadComponent({ initialAccessCode = '', initialSecretWord = '', onFileRetrieved }: DownloadComponentProps) {
    const URL = "https://fd.up.railway.app";
    const [takenAccessCode, setTakenAccessCode] = useState(initialAccessCode);
    const [takenSecretWord, setTakenSecretWord] = useState(initialSecretWord);
    const [fileBaseName, setFileBaseName] = useState('file');
    const [loading, setLoading] = useState(false);
    const [displayText, setDisplayText] = useState("");
    const [downloadComplete, setDownloadComplete] = useState(false);
    const [downloadedFileInfo, setDownloadedFileInfo] = useState<DownloadedFileInfo | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [previewKind, setPreviewKind] = useState<'image' | 'pdf' | 'none'>('none');
    const [previewBlurred, setPreviewBlurred] = useState(true);

    const { toast } = useToast();

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

    const handleDownloadFile = () => {
        if (!downloadUrl || !downloadedFileInfo) return;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = downloadedFileInfo.fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleRetrieveFile = async (accessCode?: string, sw?: string) => {
        let code = accessCode ? accessCode : takenAccessCode;
        let secW = sw ? sw : takenSecretWord;
        if (!code || !secW) {
            toast({
                title: "Missing Information",
                description: "Please enter both access code and secret word.",
                variant: "destructive"
            });
            return;
        }
        
        setLoading(true);
        setDownloadComplete(false);
        setDisplayText("");
        setDownloadedFileInfo(null);
        setPreviewKind('none');
        setPreviewBlurred(true);
        setDownloadUrl((currentUrl) => {
            if (currentUrl) {
                window.URL.revokeObjectURL(currentUrl);
            }
            return null;
        });
        try {
            const response = await fetch(`${URL}/retrieve?accessCode=${code}`, {
                method: 'GET'
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
                
                const encryptedBuffer = await response.arrayBuffer();
                const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
                const salt = new Uint8Array(base64ToArrayBuffer(saltB64));

                const decryptedBuffer = await decryptData(encryptedBuffer, secW, iv, salt);
                
                const resolvedBaseName = normalizeFileBase(fileBaseName);
                const resolvedFileName = extension === 'txt' ? `file.${extension}` : `${resolvedBaseName}.${extension}`;
                const previewType = getPreviewKind(extension);
                const fileTypeLabel = extension === 'txt'
                    ? 'Text Document'
                    : previewType === 'pdf'
                        ? 'PDF Document'
                        : previewType === 'image'
                            ? 'Image File'
                            : 'Binary File';
                const downloadInfo: DownloadedFileInfo = {
                    fileName: resolvedFileName,
                    fileType: fileTypeLabel,
                    size: decryptedBuffer.byteLength,
                    extension: extension,
                    downloadTime: new Date().toLocaleString(),
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
                    const mimeType = getMimeTypeFromExtension(extension);
                    const blob = new Blob([decryptedBuffer], { type: mimeType });
                    const url = window.URL.createObjectURL(blob);
                    setPreviewKind(previewType);
                    setDownloadUrl(url);
                    setPreviewBlurred(true);
                }
                
                setDownloadedFileInfo(downloadInfo);
                setDownloadComplete(true);
                
                toast({
                    title: "Success",
                    description: "File retrieved successfully.",
                });

                onFileRetrieved?.(code, secW);
            } else {
                const errorText = await response.text();
                toast({
                    title: "Retrieval Failed",
                    description: errorText,
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
            setLoading(false);
        }
    };

    useEffect(() => {
        if (initialAccessCode && initialSecretWord) {
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

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        Download File
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="access-code" className="font-medium">Access Code</Label>
                            <Input 
                                id="access-code"
                                value={takenAccessCode} 
                                placeholder="e.g., ro23" 
                                onChange={(e) => setTakenAccessCode(e.target.value)}
                                className="font-mono"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="secret-word" className="font-medium">Secret Word</Label>
                            <Input 
                                id="secret-word"
                                value={takenSecretWord} 
                                placeholder="e.g., motion" 
                                onChange={(e) => setTakenSecretWord(e.target.value)}
                                className="font-mono"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="file-name" className="font-medium">File name</Label>
                        <Input
                            id="file-name"
                            value={fileBaseName}
                            placeholder="file"
                            onChange={(e) => setFileBaseName(normalizeFileBase((e.target as HTMLInputElement).value))}
                        />
                        <p className="text-xs text-gray-500">
                            URLs are ignored and default to "file".
                        </p>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    Decrypting and retrieving your file...
                                </p>
                            </div>
                        </div>
                    )}

                    {!loading && (
                        <Button 
                            onClick={() => handleRetrieveFile()} 
                            className="w-full"
                            disabled={!takenAccessCode || !takenSecretWord}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Retrieve File
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Retrieved text content - moved above download stats */}
            {displayText !== "" && downloadComplete && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                Retrieved Text
                            </CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    navigator.clipboard.writeText(displayText);
                                    toast({ title: "Copied", description: "Text copied to clipboard" });
                                }}
                            >
                                <Copy className="w-4 h-4 mr-2" />
                                Copy
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            value={displayText}
                            className="min-h-[300px] font-mono text-sm resize-none bg-gray-50 dark:bg-gray-900"
                            readOnly
                        />
                    </CardContent>
                </Card>
            )}

            {downloadComplete && downloadedFileInfo && !downloadedFileInfo.isText && previewKind !== 'none' && downloadUrl && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                {previewKind === 'image' ? <ImageIcon className="w-5 h-5" /> : <File className="w-5 h-5" />}
                                Preview
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPreviewBlurred((current) => !current)}
                                >
                                    {previewBlurred ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                                    {previewBlurred ? 'Reveal' : 'Blur'}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleDownloadFile}
                                    disabled={!downloadUrl}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {previewKind === 'image' && (
                            <div className="relative rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 overflow-hidden">
                                <img
                                    src={downloadUrl}
                                    alt={downloadedFileInfo.fileName}
                                    className={`max-h-[480px] w-full object-contain rounded-md transition duration-300 ${previewBlurred ? 'blur-md' : 'blur-0'}`}
                                />
                                {previewBlurred && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/50">
                                        <span className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                            Preview blurred
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                        {previewKind === 'pdf' && (
                            <div className="relative rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                                <iframe
                                    src={downloadUrl}
                                    title={downloadedFileInfo.fileName}
                                    className={`w-full h-[520px] bg-white transition duration-300 ${previewBlurred ? 'blur-md pointer-events-none' : 'blur-0'}`}
                                />
                                {previewBlurred && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/60">
                                        <span className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                            Preview blurred
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="text-xs text-gray-500">
                            {downloadedFileInfo.fileName} · {formatFileSize(downloadedFileInfo.size)}
                        </p>
                    </CardContent>
                </Card>
            )}

            {downloadComplete && downloadedFileInfo && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            Download Successful
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                <File className="w-4 h-4 mx-auto text-gray-600" />
                                <p className="text-xs font-medium">File</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                                    {downloadedFileInfo.fileName}
                                </p>
                            </div>
                            <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                <FileText className="w-4 h-4 mx-auto text-gray-600" />
                                <p className="text-xs font-medium">Type</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {downloadedFileInfo.fileType}
                                </p>
                            </div>
                            <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                <Shield className="w-4 h-4 mx-auto text-gray-600" />
                                <p className="text-xs font-medium">Size</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {formatFileSize(downloadedFileInfo.size)}
                                </p>
                            </div>
                            <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                <CheckCircle className="w-4 h-4 mx-auto text-green-600" />
                                <p className="text-xs font-medium">Status</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Complete
                                </p>
                            </div>
                        </div>
                        {(downloadedFileInfo.remainingDownloads !== undefined || downloadedFileInfo.expiresAt) && (
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                    <Shield className="w-4 h-4 mx-auto text-gray-600" />
                                    <p className="text-xs font-medium">Downloads left</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        {downloadedFileInfo.remainingDownloads ?? '—'} / {downloadedFileInfo.maxDownloads ?? '—'}
                                    </p>
                                </div>
                                <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                    <CheckCircle className="w-4 h-4 mx-auto text-gray-600" />
                                    <p className="text-xs font-medium">Expires</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        {downloadedFileInfo.expiresAt ? new Date(downloadedFileInfo.expiresAt).toLocaleString() : '—'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
