import type { ReactNode } from "react";

export function MapWinMoment({
	playerWon,
	winnerLabel,
	mapLabel,
	score,
	seriesScore,
	scoreboard,
	footer,
}: {
	playerWon: boolean;
	winnerLabel: string;
	mapLabel: string;
	score: readonly [number, number];
	seriesScore: readonly [number, number];
	scoreboard?: ReactNode;
	footer?: ReactNode;
}) {
	const tone = playerWon ? "text-emerald-300" : "text-amber-300";
	return (
		<div
			role="dialog"
			aria-label={`${winnerLabel} take ${mapLabel} ${score[0]}–${score[1]}. Series ${seriesScore[0]}–${seriesScore[1]}.`}
			className="absolute inset-0 z-40 flex flex-col bg-zinc-950/88 px-4 py-6 backdrop-blur-[3px] motion-safe:animate-[map-win-backdrop_480ms_ease-out] sm:px-8"
		>
			{footer ? (
				<div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">{footer}</div>
			) : null}
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 motion-safe:animate-[map-win-in_480ms_ease-out]">
				<p className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${tone}`}>
					{mapLabel}
				</p>
				<h4
					className={`relative mt-2 inline-flex items-center justify-center text-4xl font-semibold tracking-[0.12em] sm:text-6xl ${
						playerWon ? "text-white" : "text-zinc-100"
					}`}
				>
					<span
						aria-hidden
						className={`map-win-score-ring ${
							playerWon ? "round-score-pulse-ring-player" : "round-score-pulse-ring-opponent"
						}`}
					/>
					<span className="map-win-score-pop relative">{playerWon ? "MAP WIN" : "MAP LOST"}</span>
				</h4>
				<p className="mt-3 text-sm text-zinc-300 sm:text-base">{winnerLabel}</p>
			</div>
			<div className="relative z-10 mx-auto mt-4 w-full max-w-4xl shrink-0 overflow-y-auto rounded-2xl border border-white/12 bg-zinc-950/90 p-4 max-h-[min(38vh,28rem)] sm:max-h-[min(46vh,28rem)] sm:p-5">
				<p className={`text-center text-4xl font-semibold tabular-nums sm:text-5xl ${tone}`}>
					{score[0]}
					<span className="text-zinc-600">–</span>
					{score[1]}
				</p>
				<p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
					Series {seriesScore[0]}–{seriesScore[1]}
				</p>
				{scoreboard ? <div className="mt-5">{scoreboard}</div> : null}
			</div>
		</div>
	);
}
