import { useEffect, useState } from 'preact/hooks';
import { Upload, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UploadComponent from '@/components/UploadComponent';
import DownloadComponent from '@/components/DownloadComponent';

export default function Home() {
    const [defaultTab, setDefaultTab] = useState(new URLSearchParams(window.location.hash.slice(1) || window.location.search).get('ac') ? 'download' : 'upload');
    const [initialAccessCode, setInitialAccessCode] = useState('');
    const [initialSecretWord, setInitialSecretWord] = useState('');

    useEffect(() => {
        checkForURLCode();
        window.addEventListener('hashchange', checkForURLCode);
        return () => window.removeEventListener('hashchange', checkForURLCode);
    }, []);

    const checkForURLCode = () => {
        const queryParams = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
        const code = queryParams.get('ac');
        const sw = queryParams.get('sw');
        if (code && sw) {
            setDefaultTab('download');
            setInitialAccessCode(code); 
            setInitialSecretWord(sw);
        }
    };

    return (
        <div className="py-8">
            <div className="w-full">
                <Tabs value={defaultTab} onValueChange={setDefaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-8">
                        <TabsTrigger value="upload" className="flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Upload
                        </TabsTrigger>
                        <TabsTrigger value="download" className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Download
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload">
                        <UploadComponent />
                    </TabsContent>

                    <TabsContent value="download">
                        <DownloadComponent 
                            initialAccessCode={initialAccessCode}
                            initialSecretWord={initialSecretWord}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
