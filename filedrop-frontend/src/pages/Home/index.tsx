import { useEffect, useState } from 'preact/hooks';
import { Upload, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UploadComponent from '@/components/UploadComponent';
import DownloadComponent from '@/components/DownloadComponent';

export default function Home() {
    const [wordList, setWordList] = useState<string[]>([]);
    const [defaultTab, setDefaultTab] = useState(new URLSearchParams(window.location.search).get('ac') ? 'download' : 'upload');
    const [initialAccessCode, setInitialAccessCode] = useState('');
    const [initialSecretWord, setInitialSecretWord] = useState('');

    useEffect(() => {
        checkForURLCode();
        fetch("/bip39.txt")
            .then((response) => response.text())
            .then((data) => {
                const words = data.split("\n");
                setWordList(words);
            });
    }, []);

    const checkForURLCode = () => {
        const queryParams = new URLSearchParams(window.location.search);
        const code = queryParams.get('ac');
        const sw = queryParams.get('sw');
        if (code && sw) {
            setInitialAccessCode(code); 
            setInitialSecretWord(sw);
        }
    };

    return (
        <div className="py-8">
            <div className="w-full">
                <Tabs defaultValue={defaultTab || 'upload'} className="w-full">
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
                        <UploadComponent wordList={wordList} />
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