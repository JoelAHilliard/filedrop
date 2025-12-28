import { useState, useEffect } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, File, FileText, CheckCircle, Copy, Shield } from 'lucide-react';
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
}

interface DownloadComponentProps {
    initialAccessCode?: string;
    initialSecretWord?: string;
    onFileRetrieved?: (accessCode: string, secretWord: string) => void;
}

export default function DownloadComponent({ initialAccessCode = '', initialSecretWord = '', onFileRetrieved }: DownloadComponentProps) {
    const URL = "https://dropit-backend-production.up.railway.app/";
    const [takenAccessCode, setTakenAccessCode] = useState(initialAccessCode);
    const [takenSecretWord, setTakenSecretWord] = useState(initialSecretWord);
    const [loading, setLoading] = useState(false);
    const [displayText, setDisplayText] = useState("");
    const [downloadComplete, setDownloadComplete] = useState(false);
    const [downloadedFileInfo, setDownloadedFileInfo] = useState<DownloadedFileInfo | null>(null);

    const { toast } = useToast();

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
        try {
            const response = await fetch(`${URL}/retrieve?accessCode=${code}`, {
                method: 'GET'
            });
            if (response.ok) {
                const ivB64 = response.headers.get('X-IV');
                const saltB64 = response.headers.get('X-SALT');
                const extension = response.headers.get('X-EXTENSION') || 'bin';
                
                if (!ivB64 || !saltB64) {
                    throw new Error("Missing encryption parameters");
                }
                
                const encryptedBuffer = await response.arrayBuffer();
                const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
                const salt = new Uint8Array(base64ToArrayBuffer(saltB64));

                const decryptedBuffer = await decryptData(encryptedBuffer, secW, iv, salt);
                
                const downloadInfo: DownloadedFileInfo = {
                    fileName: `file.${extension}`,
                    fileType: extension === 'txt' ? 'Text Document' : 'Binary File',
                    size: decryptedBuffer.byteLength,
                    extension: extension,
                    downloadTime: new Date().toLocaleString(),
                    isText: extension === 'txt'
                };
                
                if (extension === 'txt') {
                    const decoder = new TextDecoder();
                    const textContent = decoder.decode(decryptedBuffer);
                    setDisplayText(textContent);
                } else {
                    const blob = new Blob([decryptedBuffer], { type: 'application/octet-stream' });
                    const url = window.URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `file.${extension}`;
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
                    </CardContent>
                </Card>
            )}
        </div>
    );
}