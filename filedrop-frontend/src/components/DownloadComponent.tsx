import { useState, useEffect, useRef } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, FileText, CheckCircle, Copy, Shield } from 'lucide-react';
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
    
    const decryptedBufferRef = useRef<ArrayBuffer | null>(null);
    const pendingFileNameRef = useRef<string>('');
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

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

    const triggerDownload = (buffer: ArrayBuffer, fileName: string) => {
        const blob = new Blob([buffer]);
        const url = window.URL.createObjectURL(blob);
        
        // Try anchor method first
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Try clicking
        link.click();
        
        // If that didn't work, try with dispatchEvent
        if (!link.click) {
            const event = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            link.dispatchEvent(event);
        }
        
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
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
        decryptedBufferRef.current = null;
        pendingFileNameRef.current = '';

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
                const isText = extension === 'txt';
                
                const downloadInfo: DownloadedFileInfo = {
                    fileName: resolvedFileName,
                    fileType: isText ? 'Text Document' : 'File',
                    size: decryptedBuffer.byteLength,
                    extension: extension,
                    downloadTime: new Date().toLocaleString(),
                    isText: isText,
                    remainingDownloads: remainingDownloadsHeader ? Number(remainingDownloadsHeader) : undefined,
                    maxDownloads: maxDownloadsHeader ? Number(maxDownloadsHeader) : undefined,
                    expiresAt: expiresAtHeader || undefined
                };
                
                // Store for manual download if needed
                decryptedBufferRef.current = decryptedBuffer;
                pendingFileNameRef.current = resolvedFileName;
                
                // Auto-download with slight delay
                setTimeout(() => {
                    triggerDownload(decryptedBuffer, resolvedFileName);
                }, 50);
                
                // Show text content inline only for .txt files
                if (isText) {
                    const decoder = new TextDecoder();
                    const textContent = decoder.decode(decryptedBuffer);
                    setDisplayText(textContent);
                }
                
                setDownloadedFileInfo(downloadInfo);
                setDownloadComplete(true);
                
                toast({
                    title: "Success",
                    description: isText ? "File ready." : "File downloaded.",
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

    // Auto-fetch when URL has access code and secret word
    useEffect(() => {
        if (initialAccessCode && initialSecretWord) {
            const timer = setTimeout(() => {
                handleRetrieveFile(initialAccessCode, initialSecretWord);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [initialAccessCode, initialSecretWord]);

    const handleManualDownload = () => {
        if (decryptedBufferRef.current && pendingFileNameRef.current) {
            triggerDownload(decryptedBufferRef.current, pendingFileNameRef.current);
        } else {
            handleRetrieveFile();
        }
    };

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
                            onClick={handleRetrieveFile} 
                            className="w-full"
                            disabled={!takenAccessCode || !takenSecretWord}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Retrieve File
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Manual download button if auto-download was blocked */}
            {!loading && downloadComplete && decryptedBufferRef.current && (
                <Button 
                    onClick={handleManualDownload} 
                    className="w-full"
                    size="lg"
                    variant="outline"
                >
                    <Download className="w-5 h-5 mr-2" />
                    Download Again
                </Button>
            )}

            {/* Text content - only for .txt files */}
            {displayText !== "" && downloadComplete && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                Text Content
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

            {/* Download stats */}
            {downloadComplete && downloadedFileInfo && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            Download Complete
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                <FileText className="w-4 h-4 mx-auto text-gray-600" />
                                <p className="text-xs font-medium">File</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                                    {downloadedFileInfo.fileName}
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
                                    Done
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
