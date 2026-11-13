import { ModeToggle } from './mode-toggle';

export function Header() {
	return (
		<header>
			<nav class="flex w-full justify-between gap-2 items-center">
				<div class="flex items-baseline gap-2 min-w-0">
					<h1 class="font-teko font-bold text-2xl underline shrink-0">filedrop</h1>
					<p class="hidden sm:block text-xs text-muted-foreground truncate">
						Encrypted, expiring file transfer
					</p>
				</div>
				<ModeToggle />
			</nav>
		</header>
	);
}
