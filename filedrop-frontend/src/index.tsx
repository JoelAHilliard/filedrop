import { render } from 'preact';
import { LocationProvider, Router, Route } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';

import { Header } from './components/Header.jsx';
import Home from './pages/Home/index.jsx';
import { NotFound } from './pages/_404.jsx';
import './style.css';
import { ThemeProvider } from './components/theme-provider.js';
import { Toaster } from './components/ui/toaster.js';
import { BeginnerPopup } from './components/BeginnerPopup.js';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';

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
				{/* Native document scrolling: momentum scrolling and browser chrome
				    collapse work correctly on mobile, unlike a fixed-height inner
				    scroll container. */}
				<div class="flex flex-col min-h-dvh bg-muted">
					<div class="bg-muted w-full flex flex-col justify-between gap-2 safe-top">
						<div class="py-2 max-w-4xl mx-auto w-full flex flex-col justify-between gap-2 safe-x">
							<Header />
						</div>
					</div>

					<div class="flex-grow bg-background w-full">
						<main class="max-w-4xl mx-auto w-full flex flex-col py-1 justify-between gap-2 safe-x">
							<Router>
								<Route path="/" component={Home} />
								<Route default component={NotFound} />
							</Router>
						</main>
					</div>

					<Toaster />

					<div class="w-full bg-muted border-t safe-bottom">
						<div id="footer" class="max-w-4xl mx-auto w-full pb-6 safe-x">
							<Accordion type="single" collapsible className="w-full">
								<AccordionItem value="item-1" className="border-none">
									<AccordionTrigger className="text-sm hover:no-underline py-3 touch-target text-left">
										What is Filedrop?
									</AccordionTrigger>
									<AccordionContent className="text-sm text-muted-foreground pb-3">
										Filedrop is a solution for swift and uncomplicated file sharing between computers. Designed for speed and simplicity, this application allows users to pass files quickly without the need for an account or any complicated setup.
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="item-2" className="border-none">
									<AccordionTrigger className="text-sm hover:no-underline py-3 touch-target text-left">
										Is Filedrop for long-term storage?
									</AccordionTrigger>
									<AccordionContent className="text-sm text-muted-foreground pb-3">
										No. Files are deleted when the download limit is reached or when they expire (default 24 hours, max 3 days). Filedrop is not a long-term storage solution.
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="item-3" className="border-none">
									<AccordionTrigger className="text-sm hover:no-underline py-3 touch-target text-left">
										Can Filedrop see my uploads?
									</AccordionTrigger>
									<AccordionContent className="text-sm text-muted-foreground pb-3">
										No! All files are encrypted at time of upload and decrypted when you retrieve them. Filedrop cannot see the files true contents.
									</AccordionContent>
								</AccordionItem>
							</Accordion>
							<div class="text-center text-xs text-muted-foreground mt-6 pt-4 border-t">
								© {new Date().getFullYear()} Filedrop. Files auto-delete based on your settings.
							</div>
						</div>
					</div>

					{/* Only show BeginnerPopup if no access code and secret word in URL */}
					{showBeginnerPopup && <BeginnerPopup />}
				</div>
			</ThemeProvider>
		</LocationProvider>
	);
}

render(
	<>
		<App />
	</>,
	document.getElementById('app')
);
