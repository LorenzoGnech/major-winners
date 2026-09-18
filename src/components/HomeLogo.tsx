type HomeLogoProps = {
	onGoHome: () => void;
};

export function HomeLogo({ onGoHome }: HomeLogoProps) {
	return (
		<a
			href="/"
			aria-label="Major Winners home"
			className="fixed top-[max(0.75rem,var(--safe-top))] left-[max(0.75rem,var(--safe-left))] z-[100] flex size-16 items-center justify-center rounded-full sm:top-[max(1rem,var(--safe-top))] sm:left-[max(1rem,var(--safe-left))] sm:size-20"
			onClick={(event) => {
				event.preventDefault();
				onGoHome();
			}}
		>
			<span className="absolute inset-0 rounded-full bg-[#e53935]/20 blur-xl" aria-hidden />
			<img
				src="/logo.png"
				alt=""
				width={96}
				height={96}
				className="relative size-14 object-contain sm:size-16"
			/>
		</a>
	);
}
