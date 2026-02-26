const SlugNotFound = () => (
	<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
		<div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
			<h1 className="text-xl font-semibold tracking-tight">Pagina nao encontrada</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Esse subdominio nao existe ou nao esta liberado.
			</p>
		</div>
	</div>
);

export default SlugNotFound;
