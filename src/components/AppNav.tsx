import type { ReactNode } from "react";
import { donateUrl } from "./donate";

type AppNavProps = {
	onGoHome: () => void;
	action?: ReactNode;
};

function CoffeeIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
			<path
				fill="currentColor"
				d="M3.75 6.5h12.5v6.25a4.75 4.75 0 0 1-4.75 4.75H8.5a4.75 4.75 0 0 1-4.75-4.75zm13.25 1.25h1.1A3.4 3.4 0 0 1 21.5 11.15a3.4 3.4 0 0 1-3.4 3.4h-1.1zM7 19.25h8.25a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1 0-1.5z"
			/>
		</svg>
	);
}

export function AppNav({ onGoHome, action }: AppNavProps) {
	const donate = donateUrl();

	return (
		<>
			<nav
				aria-label="Site"
				className="fixed inset-x-0 top-0 z-50 bg-transparent pt-[var(--safe-top)]"
			>
				<div className="flex h-12 items-center justify-between gap-3 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] sm:h-14 sm:pl-[max(1rem,var(--safe-left))] sm:pr-[max(1rem,var(--safe-right))]">
					<a
						href="/"
						aria-label="Major Winners home"
						className="flex size-10 items-center justify-center sm:size-11"
						onClick={(event) => {
							event.preventDefault();
							onGoHome();
						}}
					>
						<img
							src="/logo.png"
							alt=""
							width={48}
							height={48}
							className="size-8 object-contain sm:size-9"
						/>
					</a>
					<div className="flex min-w-0 items-center gap-2">
						<a
							href={donate}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/25 bg-amber-300/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-200/45 hover:bg-amber-300/16 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
						>
							<CoffeeIcon />
							<span className="hidden sm:inline">Buy me a coffee</span>
							<span className="sm:hidden">Coffee</span>
						</a>
						{action}
					</div>
				</div>
			</nav>
			<div className="h-[var(--app-nav-height)] shrink-0" aria-hidden />
		</>
	);
}
