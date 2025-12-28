import { useLocation } from 'preact-iso';
import { ModeToggle } from './mode-toggle';
export function Header() {
	return (
		<header>
			<nav class="flex w-full justify-between gap-2 items-center">
				<h1 class="font-teko font-bold text-2xl underline">filedrop.</h1>
				<ModeToggle />
			</nav>
		</header>
	);
}
