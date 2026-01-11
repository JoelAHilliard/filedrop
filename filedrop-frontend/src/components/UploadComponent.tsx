import { useState } from 'preact/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, File, Upload, FileText, RefreshCw, CheckCircle, Info, Shield, Eye, EyeOff, Timer, Download as DownloadIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import QRCode from "react-qr-code";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { encryptData, arrayBufferToBase64, str2ab, formatFileSize } from '@/utils/crypto';
import FileDropZone from '@/components/FileDropZone';
import { Checkbox } from '@/components/ui/checkbox';

interface UploadComponentProps {
    wordList: string[];
}

export default function UploadComponent({ wordList }: UploadComponentProps) {
    const URL = "https://fd.up.railway.app";
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [givenAccessCode, setGivenAccessCode] = useState('');
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploadFile, setUploadFile] = useState(true);
    const [secretWord, setSecretWord] = useState('');
    const [showSecretWord, setShowSecretWord] = useState(false);
    const [fileSize, setFileSize] = useState(0);
    const [uploadComplete, setUploadComplete] = useState(false);
    const [maxDownloads, setMaxDownloads] = useState(5);
    const [ttlHours, setTtlHours] = useState(24);
    const [burnAfterRead, setBurnAfterRead] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [dropzoneKey, setDropzoneKey] = useState(0);

    const { toast } = useToast();


    const handleDropZoneChange = (files: File[]) => {
        if (files && files.length > 0) {
            const file = files[0];
            setSelectedFile(file);
            setFileSize(file.size);
            // Reset upload state when a new file is selected
            if (uploadComplete) {
                setUploadComplete(false);
                setGivenAccessCode('');
                setSecretWord('');
                setExpiresAt('');
            }
        }
    };

    const resetUpload = () => {
        setUploadComplete(false);
        setGivenAccessCode('');
        setSecretWord('');
        setSelectedFile(null);
        setInputText('');
        setFileSize(0);
        setExpiresAt('');
        setDropzoneKey(prev => prev + 1); // Force dropzone reset
    };

    const handleUpload = async (event: any) => {
        event.preventDefault();
        setLoading(true);
        setUploadComplete(false);
        setExpiresAt('');

        const index = Math.floor(Math.random() * wordList.length);
        const sw = wordList[index].replace("\r","");
        
        if (!sw) {
            toast({
                title: "Error",
                description: "Secret word not available.",
                variant: "destructive"
            });
            setLoading(false);
            return;
        }
        
        if (!uploadFile) {
            if(inputText === ''){
                toast({
                    title: "No Content",
                    description: "Please enter some text to upload.",
                    variant: "destructive"
                });
                setLoading(false);
                return;
            }
            let buffer = str2ab(inputText);
            setFileSize(buffer.byteLength);
            
            const { encryptedBuffer, iv, salt } = await encryptData(buffer, sw);
            const downloadsLimit = burnAfterRead ? 1 : maxDownloads;
            const ttlSeconds = Math.max(1, ttlHours) * 3600;
            const formData = new FormData();
            formData.append('file', new Blob([encryptedBuffer]), 'file.txt');
            formData.append('type', 'text/plain');
            formData.append('secretWord', sw);
            formData.append('iv', arrayBufferToBase64(iv));
            formData.append('salt', arrayBufferToBase64(salt));
            formData.append('maxDownloads', String(downloadsLimit));
            formData.append('ttlSeconds', String(ttlSeconds));
    
            try {
                const response = await fetch(`${URL}/upload`, {
                    method: 'POST',
                    body: formData,
                });
                if (response.ok) {
                    const data = await response.json();
                    setGivenAccessCode(data.key);
                    setSecretWord(sw);
                    setUploadComplete(true);
                    setExpiresAt(data.expiresAt || '');
                    
                    toast({
                        title: "Upload Successful",
                        description: "Your text has been securely uploaded.",
                    });
                } else {
                    const errorText = await response.text();
                    toast({
                        title: "Upload Failed",
                        description: errorText,
                        variant: "destructive"
                    });
                }
            } catch (error) {
                console.error('Error during upload:', error);
                toast({
                    title: "Upload Failed",
                    description: "An error occurred during upload.",
                    variant: "destructive"
                });
            } finally {
                setLoading(false);
            }
        } else {
            if (!selectedFile) {
                toast({
                    title: "No File Selected",
                    description: "Please select a file to upload.",
                    variant: "destructive"
                });
                setLoading(false);
                return;
            }
    
            const maxFileSize = 250 * 1024 * 1024; // 250MB
            if (selectedFile.size > maxFileSize) {
                toast({
                    title: "File Too Large",
                    description: "File size exceeds the maximum limit of 250MB.",
                    variant: "destructive"
                });
                setLoading(false);
                return;
            }
    
            let fileData = await selectedFile.arrayBuffer();
            
            const { encryptedBuffer, iv, salt } = await encryptData(fileData, sw);
            const downloadsLimit = burnAfterRead ? 1 : maxDownloads;
            const ttlSeconds = Math.max(1, ttlHours) * 3600;
            const formData = new FormData();
            formData.append('file', new Blob([encryptedBuffer]), selectedFile.name);
            formData.append('type', selectedFile.type);
            formData.append('secretWord', sw);
            formData.append('iv', arrayBufferToBase64(iv));
            formData.append('salt', arrayBufferToBase64(salt));
            formData.append('maxDownloads', String(downloadsLimit));
            formData.append('ttlSeconds', String(ttlSeconds));
    
            try {
                const response = await fetch(`${URL}/upload`, {
                    method: 'POST',
                    body: formData,
                });
                if (response.ok) {
                    const data = await response.json();
                    setGivenAccessCode(data.key);
                    setSecretWord(sw);
                    setUploadComplete(true);
                    setExpiresAt(data.expiresAt || '');
                    
                    toast({
                        title: "Upload Successful",
                        description: `${selectedFile.name} has been securely uploaded.`,
                    });
                } else {
                    const errorText = await response.text();
                    toast({
                        title: "Upload Failed",
                        description: errorText,
                        variant: "destructive"
                    });
                }
            } catch (error) {
                console.error('Error during upload:', error);
                toast({
                    title: "Upload Failed",
                    description: "An error occurred during upload.",
                    variant: "destructive"
                });
            } finally {
                setLoading(false);
            }
        }
    };

    const handleCopy = async (text: string, type: string) => {
        await navigator.clipboard.writeText(text);
        const messages: Record<string, string> = {
            accessCode: "Access code copied to clipboard",
            secretWord: "Secret word copied to clipboard",
            link: "Share link copied to clipboard"
        };
        toast({ title: "Copied", description: messages[type] });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            {uploadFile ? <File className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                            {uploadFile ? 'Upload File' : 'Upload Text'}
                        </CardTitle>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                                setUploadFile(!uploadFile);
                                // Reset upload state when switching modes
                                if (uploadComplete) {
                                    setUploadComplete(false);
                                    setGivenAccessCode('');
                                    setSecretWord('');
                                    setExpiresAt('');
                                }
                            }}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {uploadFile ? "Text" : "File"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {uploadFile ? (
                        <FileDropZone 
                            onChange={handleDropZoneChange} 
                            resetKey={dropzoneKey}
                            selectedFile={selectedFile}
                            onRemoveFile={() => {
                                setSelectedFile(null);
                                setDropzoneKey(prev => prev + 1);
                            }}
                            formatFileSize={formatFileSize}
                        />
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="text-input" className="mb-2 block font-medium">
                                    Text Content
                                </Label>
                                <Textarea
                                    id="text-input"
                                    value={inputText}
                                    onChange={(e: any) => {
                                        setInputText(e.target.value);
                                        setFileSize(new TextEncoder().encode(e.target.value).length);
                                    }}
                                    placeholder="Enter your text here..."
                                    className="min-h-[200px] resize-none"
                                />
                            </div>
                            {inputText && (
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-500">
                                        {inputText.length} characters
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 sm:p-4 space-y-3 sm:space-y-4">
                        <div className="flex items-start sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-medium">Access Controls</h3>
                                <p className="text-xs text-gray-500 hidden sm:block">Set expiry and download limits before upload.</p>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-500 shrink-0">
                                <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span>{ttlHours >= 24 ? `${ttlHours / 24}d` : `${ttlHours}h`} TTL</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="ttl-hours" className="text-sm">Expiry (hours, max 3 days)</Label>
                                <Input
                                    id="ttl-hours"
                                    type="number"
                                    min={1}
                                    max={72}
                                    value={ttlHours}
                                    onChange={(e: any) => {
                                        const nextValue = Number(e.target.value);
                                        if (!Number.isFinite(nextValue)) {
                                            setTtlHours(1);
                                            return;
                                        }
                                        setTtlHours(Math.max(1, Math.min(72, nextValue)));
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max-downloads" className="text-sm">Max downloads</Label>
                                <Input
                                    id="max-downloads"
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={burnAfterRead ? 1 : maxDownloads}
                                    disabled={burnAfterRead}
                                    onChange={(e: any) => {
                                        const nextValue = Number(e.target.value);
                                        if (!Number.isFinite(nextValue)) {
                                            setMaxDownloads(1);
                                            return;
                                        }
                                        setMaxDownloads(Math.max(1, Math.min(100, nextValue)));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="burn-after-read"
                                checked={burnAfterRead}
                                onCheckedChange={(value) => setBurnAfterRead(Boolean(value))}
                            />
                            <Label htmlFor="burn-after-read" className="text-sm">
                                Burn after first download
                            </Label>
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {uploadFile ? 'Uploading file...' : 'Uploading text...'}
                                </p>
                            </div>
                        </div>
                    )}

                    {!loading && (
                        <div className="space-y-3">
                            {uploadComplete ? (
                                <>
                                    <Button 
                                        onClick={() => {
                                            const link = `${window.location.origin}/?ac=${givenAccessCode}&sw=${secretWord}`;
                                            handleCopy(link, 'link');
                                        }}
                                        className="w-full"
                                    >
                                        <Copy className="w-4 h-4 mr-2" />
                                        Copy Share Link
                                    </Button>
                                    <button
                                        onClick={resetUpload}
                                        className="w-full text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 underline"
                                    >
                                        Upload Another
                                    </button>
                                </>
                            ) : (
                                <Button 
                                    onClick={handleUpload} 
                                    className="w-full"
                                    disabled={uploadFile ? !selectedFile : !inputText}
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {uploadFile ? 'Upload File' : 'Upload Text'}
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {uploadComplete && givenAccessCode && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            Upload Successful
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="font-medium">Access Code</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            value={givenAccessCode} 
                                            readOnly 
                                            className="font-mono"
                                        />
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            onClick={() => handleCopy(givenAccessCode, 'accessCode')}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="font-medium">Secret Word</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            type={showSecretWord ? "text" : "password"}
                                            value={secretWord} 
                                            readOnly 
                                            className="font-mono"
                                        />
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            onClick={() => setShowSecretWord(!showSecretWord)}
                                        >
                                            {showSecretWord ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            onClick={() => handleCopy(secretWord, 'secretWord')}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <Button 
                                    variant="outline" 
                                    className="w-full"
                                    onClick={() => {
                                        const link = `${window.location.origin}/?ac=${givenAccessCode}&sw=${secretWord}`;
                                        handleCopy(link, 'link');
                                    }}
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Share Link
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-center space-y-1">
                                    <DownloadIcon className="w-4 h-4 mx-auto text-gray-500" />
                                    <p className="text-xs font-medium">Max downloads</p>
                                    <p className="text-xs text-gray-500">{burnAfterRead ? 1 : maxDownloads}</p>
                                </div>
                                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-center space-y-1">
                                    <Timer className="w-4 h-4 mx-auto text-gray-500" />
                                    <p className="text-xs font-medium">Expires</p>
                                    <p className="text-xs text-gray-500">
                                        {expiresAt ? new Date(expiresAt).toLocaleString() : `${ttlHours} hours (max 3 days)`}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center space-y-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                                <div className="bg-white p-3 rounded border">
                                    <QRCode 
                                        size={120} 
                                        value={`${window.location.origin}/?ac=${givenAccessCode}&sw=${secretWord}`} 
                                    />
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Scan to download
                                </p>
                            </div>
                        </div>

                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Important</AlertTitle>
                            <AlertDescription>
                                Store both the access code and secret word safely. If you lose them, your file cannot be recovered.
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            )}


            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Security Features
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                        <div className="text-center space-y-2">
                            <Shield className="w-6 h-6 mx-auto text-gray-600" />
                            <h3 className="font-medium text-sm">AES-256 Encryption</h3>
                            <p className="text-xs text-gray-500">
                                End-to-end encryption
                            </p>
                        </div>
                        <div className="text-center space-y-2">
                            <Timer className="w-6 h-6 mx-auto text-gray-600" />
                            <h3 className="font-medium text-sm">Custom TTL</h3>
                            <p className="text-xs text-gray-500">
                                Up to 3 days
                            </p>
                        </div>
                        <div className="text-center space-y-2">
                            <DownloadIcon className="w-6 h-6 mx-auto text-gray-600" />
                            <h3 className="font-medium text-sm">Download Limits</h3>
                            <p className="text-xs text-gray-500">
                                Control access frequency
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
