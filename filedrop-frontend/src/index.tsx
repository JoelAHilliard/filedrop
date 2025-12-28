import { render } from 'preact';
import { LocationProvider, Router, Route } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';

import { Header } from './components/Header.jsx';
import  Home  from './pages/Home/index.jsx';
import { NotFound } from './pages/_404.jsx';
import './style.css';
import { ThemeProvider } from './components/theme-provider.js';
import { Toaster } from './components/ui/toaster.js';
import {BeginnerPopup} from './components/BeginnerPopup.js'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
  } from "@/components/ui/accordion"
  import { Analytics } from "@vercel/analytics/react"

export function App() {
	const [showBeginnerPopup, setShowBeginnerPopup] = useState(true);

	useEffect(() => {
		// Check if URL has access code and secret word parameters
		const queryParams = new URLSearchParams(window.location.search);
		const hasAccessCode = queryParams.get('ac');
		const hasSecretWord = queryParams.get('sw');
		
		// If both parameters are present, don't show the beginner popup
		if (hasAccessCode && hasSecretWord) {
			setShowBeginnerPopup(false);
		}
	}, []);

	return (
		<LocationProvider>
			<ThemeProvider>
			<SimpleBar style={{ maxHeight: '100vh' }} className="h-screen">
				<div class="flex flex-col min-h-screen bg-muted safe-top safe-bottom">
					
					<div class="bg-muted w-full flex flex-col justify-between gap-2">
						<div class="py-2 max-w-2xl mx-auto w-full flex flex-col justify-between gap-2 px-4 safe-left safe-right">
							<Header />
						</div>
					</div>

					<div class="flex-grow bg-background w-full">
						<main class="max-w-2xl mx-auto w-full flex flex-col py-1 justify-between gap-2 px-4 safe-left safe-right">
							<Router>
								<Route path="/" component={Home} />
								<Route default component={NotFound} />
							</Router>
						</main>
					</div>

				<Toaster />

				<div class="w-full bg-muted border-t">
					<div id='footer' class="max-w-2xl mx-auto w-full px-4 pb-6 safe-left safe-right">
						<Accordion type="single" collapsible className="w-full">
							<AccordionItem value="item-1" className="border-none">
								<AccordionTrigger className="text-sm hover:no-underline py-3">What is Filedrop?</AccordionTrigger>
								<AccordionContent className="text-sm text-muted-foreground pb-3">
									Filedrop is a solution for swift and uncomplicated file sharing between computers. Designed for speed and simplicity, this application allows users to pass files quickly without the need for an account or any complicated setup.
								</AccordionContent>
							</AccordionItem>
							<AccordionItem value="item-2" className="border-none">
								<AccordionTrigger className="text-sm hover:no-underline py-3">Is Filedrop for long-term storage?</AccordionTrigger>
								<AccordionContent className="text-sm text-muted-foreground pb-3">
									No. As soon as the file is downloaded, or 2 hours after initial upload, the file is deleted. Filedrop is not a long-term storage solution.
								</AccordionContent>
							</AccordionItem>
							<AccordionItem value="item-3" className="border-none">
								<AccordionTrigger className="text-sm hover:no-underline py-3">Can Filedrop see my uploads?</AccordionTrigger>
								<AccordionContent className="text-sm text-muted-foreground pb-3">
									No! All files are encrypted at time of upload and decrypted when you retrieve them. Filedrop cannot see the files true contents.
								</AccordionContent>
							</AccordionItem>
						</Accordion>
						<div class="text-center text-xs text-muted-foreground mt-6 pt-4 border-t">
							© 2024 Filedrop. Files auto-delete after 24 hours.
						</div>
					</div>
				</div>

					{/* Only show BeginnerPopup if no access code and secret word in URL */}
					{showBeginnerPopup && <BeginnerPopup />}
					
				</div>
			</SimpleBar>
			</ThemeProvider>
		</LocationProvider>
	);
}

render(
	<>
		<App />
		<Analytics />
	</>,
	document.getElementById('app')
);