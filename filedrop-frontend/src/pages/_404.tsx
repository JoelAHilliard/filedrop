export function NotFound() {
	return (
		<section class="py-16 text-center space-y-3">
			<h1 class="text-2xl font-semibold">404: Not Found</h1>
			<p class="text-muted-foreground">It's gone :(</p>
			<a
				href="/"
				class="inline-flex h-(--control-h) items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,scale] duration-150 hover:bg-primary/90 active:scale-[0.96] active:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
			>
				Back to Filedrop
			</a>
		</section>
	);
}
