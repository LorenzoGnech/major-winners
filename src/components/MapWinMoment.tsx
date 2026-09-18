import type { ReactNode } from "react";

export function MapWinMoment({
	playerWon,
	winnerLabel,
	mapLabel,
	score,
	seriesScore,
	footer,
}: {
	playerWon: boolean;
	winnerLabel: string;
	mapLabel: string;
	score: readonly [number, number];
	seriesScore: readonly [number, number];
	footer?: ReactNode;
}) {
	const tone = playerWon ? "text-emerald-300" : "text-amber-300";
	return (
		<div
			role="dialog"
			aria-label={`${winnerLabel} take ${mapLabel} ${score[0]}–${score[1]}. Series ${seriesScore[0]}–${seriesScore[1]}.`}
			className="absolute inset-0 z-40 flex flex-col justify-center bg-zinc-950/88 px-4 py-6 backdrop-blur-[3px] motion-safe:animate-[map-win-in_480ms_ease-out] sm:px-8"
		>
			{footer ? (
				<div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">{footer}</div>
			) : null}
			<div className="mx-auto w-full max-w-xl text-center">
				<p className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${tone}`}>
					{mapLabel}
				</p>
				<h4
					className={`mt-2 text-4xl font-semibold tracking-[0.12em] sm:text-6xl ${
						playerWon ? "text-white" : "text-zinc-100"
					}`}
				>
					{playerWon ? "MAP WIN" : "MAP LOST"}
				</h4>
				<p className="mt-3 text-sm text-zinc-300 sm:text-base">{winnerLabel}</p>
				<p
					className={`map-win-score-pop mt-6 text-5xl font-semibold tabular-nums sm:text-6xl ${tone}`}
				>
					<span className="relative inline-flex items-center justify-center">
						<span
							aria-hidden
							className={`map-win-score-ring ${
								playerWon ? "round-score-pulse-ring-player" : "round-score-pulse-ring-opponent"
							}`}
						/>
						<span className="relative">
							{score[0]}
							<span className="text-zinc-600">–</span>
							{score[1]}
						</span>
					</span>
				</p>
				<p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
					Series {seriesScore[0]}–{seriesScore[1]}
				</p>
			</div>
		</div>
	);
}
