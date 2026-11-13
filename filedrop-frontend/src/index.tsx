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

const FAQ = [
	{
		question: 'What is Filedrop?',
		answer: 'Filedrop is a solution for swift and uncomplicated file sharing between computers. Designed for speed and simplicity, this application allows users to pass files quickly without the need for an account or any complicated setup.',
	},
	{
		question: 'Is Filedrop for long-term storage?',
		answer: 'No. Files are deleted when the download limit is reached or when they expire (default 24 hours, max 3 days). Filedrop is not a long-term storage solution.',
	},
	{
		question: 'Can Filedrop see my uploads?',
		answer: 'No! All files are encrypted at time of upload and decrypted when you retrieve them. Filedrop cannot see the files true contents.',
	},
];

export function App() {
	const [showBeginnerPopup, setShowBeginnerPopup] = useState(true);

	useEffect(() => {
		// Check if URL has access code and secret word parameters
		const queryParams = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
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
				{/* The document itself scrolls: momentum scrolling, the collapsing
				    browser toolbar and tap-status-bar-to-top only work that way on
				    phones, not with a fixed-height inner scroll container. */}
				<div class="flex min-h-dvh flex-col bg-background">
					<div class="w-full bg-muted pt-[env(safe-area-inset-top)]">
						<div class="mx-auto w-full max-w-4xl py-2 safe-x">
							<Header />
						</div>
					</div>

					<main class="mx-auto w-full max-w-4xl grow safe-x">
						<Router>
							<Route path="/" component={Home} />
							<Route default component={NotFound} />
						</Router>
					</main>

					<footer class="w-full border-t bg-muted pb-[max(1.5rem,env(safe-area-inset-bottom))]">
						<div id="footer" class="mx-auto w-full max-w-4xl safe-x">
							<Accordion type="single" collapsible className="w-full">
								{FAQ.map(({ question, answer }, index) => (
									<AccordionItem key={question} value={`item-${index + 1}`} className="border-none">
										<AccordionTrigger className="py-3 text-sm hover:no-underline">
											{question}
										</AccordionTrigger>
										<AccordionContent className="pb-3 text-sm text-muted-foreground">
											{answer}
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
							<div class="mt-4 border-t pt-4 text-center text-xs text-muted-foreground">
								© {new Date().getFullYear()} Filedrop. Files auto-delete based on your settings.
							</div>
						</div>
					</footer>

					<Toaster />

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
