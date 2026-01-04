import { useState, useEffect } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, File, FileText, CheckCircle, Copy, Shield, Eye, EyeOff, Image } from 'lucide-react';
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

interface PreviewData {
    url: string;
    type: 'image' | 'pdf';
}

/** List of file extensions that support preview */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
const PDF_EXTENSIONS = ['pdf'];

/**
 * Check if file extension supports preview
 * @param extension - File extension (without dot)
 * @returns Preview type ('image' | 'pdf') or null if not previewable
 */
function getPreviewType(extension: string): 'image' | 'pdf' | null {
    const ext = extension.toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
    if (PDF_EXTENSIONS.includes(ext)) return 'pdf';
    return null;
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
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [isPreviewBlurred, setIsPreviewBlurred] = useState(true);

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
        // Cleanup previous preview URL before fetching new file
        if (previewData?.url) {
            window.URL.revokeObjectURL(previewData.url);
        }
        setPreviewData(null);
        setIsPreviewBlurred(true);
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
                const downloadInfo: DownloadedFileInfo = {
                    fileName: resolvedFileName,
                    fileType: extension === 'txt' ? 'Text Document' : 'Binary File',
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
                    // Check if file is previewable (image or PDF)
                    const previewType = getPreviewType(extension);
                    
                    if (previewType) {
                        // Create appropriate MIME type for preview
                        const mimeType = previewType === 'pdf' 
                            ? 'application/pdf' 
                            : `image/${extension === 'svg' ? 'svg+xml' : extension}`;
                        const blob = new Blob([decryptedBuffer], { type: mimeType });
                        const previewUrl = window.URL.createObjectURL(blob);
                        setPreviewData({ url: previewUrl, type: previewType });
                    }
                    
                    // Always trigger download for non-text files
                    const blob = new Blob([decryptedBuffer], { type: 'application/octet-stream' });
                    const url = window.URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = resolvedFileName;
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
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

    // Cleanup preview URL on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (previewData?.url) {
                window.URL.revokeObjectURL(previewData.url);
            }
        };
    }, [previewData]);

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

            {/* Preview for images and PDFs */}
            {previewData && downloadComplete && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Image className="w-5 h-5" />
                                File Preview
                            </CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsPreviewBlurred(!isPreviewBlurred)}
                            >
                                {isPreviewBlurred ? (
                                    <>
                                        <Eye className="w-4 h-4 mr-2" />
                                        Show Preview
                                    </>
                                ) : (
                                    <>
                                        <EyeOff className="w-4 h-4 mr-2" />
                                        Blur Preview
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div 
                            className="relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                            style={{ minHeight: '300px' }}
                        >
                            {previewData.type === 'image' ? (
                                <img
                                    src={previewData.url}
                                    alt="File preview"
                                    className={`max-w-full max-h-[500px] object-contain transition-all duration-300 ${
                                        isPreviewBlurred ? 'blur-xl' : 'blur-0'
                                    }`}
                                    style={{ cursor: isPreviewBlurred ? 'pointer' : 'default' }}
                                    onClick={() => isPreviewBlurred && setIsPreviewBlurred(false)}
                                />
                            ) : (
                                <iframe
                                    src={previewData.url}
                                    title="PDF preview"
                                    className={`w-full h-[500px] border-0 transition-all duration-300 ${
                                        isPreviewBlurred ? 'blur-xl' : 'blur-0'
                                    }`}
                                    style={{ cursor: isPreviewBlurred ? 'pointer' : 'default' }}
                                    onClick={() => isPreviewBlurred && setIsPreviewBlurred(false)}
                                />
                            )}
                            {isPreviewBlurred && (
                                <div 
                                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                                    onClick={() => setIsPreviewBlurred(false)}
                                >
                                    <div className="bg-black/50 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                                        <Eye className="w-5 h-5" />
                                        Click to reveal
                                    </div>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                            {previewData.type === 'image' ? 'Image' : 'PDF'} preview is blurred for privacy. Click to reveal.
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
