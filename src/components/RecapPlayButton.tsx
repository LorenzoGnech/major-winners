import type { ReactNode } from "react";

export function RecapPlayButton({
	onClick,
	children,
}: {
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<div className="flex justify-center">
			<button
				type="button"
				onClick={onClick}
				className="min-w-56 rounded-xl bg-emerald-300 px-8 py-3.5 text-base font-bold text-zinc-950 shadow-[0_0_28px_rgba(110,231,183,0.4)] transition hover:bg-emerald-200 hover:shadow-[0_0_36px_rgba(110,231,183,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 sm:min-w-64 sm:px-10 sm:py-4 sm:text-lg"
			>
				{children}
			</button>
		</div>
	);
}
