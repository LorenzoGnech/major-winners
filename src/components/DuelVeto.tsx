import type { DuelRoom, DuelSide } from "../community";
import { otherSide, rosterForSide, sideIndex, vetoStateFromRoom } from "../community";
import { DUEL_VETO_STEPS, MAP_POOL, type SimMapId } from "../engine";

export function DuelRoomBanner({
	code,
	detail,
	ranked = false,
}: {
	code: string;
	detail: string;
	ranked?: boolean;
}) {
	return (
		<section className="mb-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
			<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
				{ranked ? "Ranked match" : "Private match"}
			</p>
			{ranked ? (
				<p className="mt-1 text-sm font-semibold text-white">Match {code}</p>
			) : (
				<p className="mt-1 font-mono text-2xl tracking-[0.28em] text-white">{code}</p>
			)}
			<p className="mt-2 text-sm text-zinc-400">{detail}</p>
		</section>
	);
}

const VETO_STEP_IDS = [
	"host-ban-1",
	"guest-ban-1",
	"host-pick-1",
	"guest-pick-1",
	"host-ban-2",
	"guest-ban-2",
	"host-pick-2",
	"guest-pick-2",
] as const;

const STYLE_LABEL = {
	aim: "Aim",
	tactical: "Tactical",
	hybrid: "Hybrid",
} as const;

export function DuelVeto({
	room,
	side,
	busy,
	error,
	onPick,
}: {
	room: DuelRoom;
	side: DuelSide;
	busy?: boolean;
	error?: string | null;
	onPick: (mapId: SimMapId) => void;
}) {
	const veto = vetoStateFromRoom(room);
	const yours = rosterForSide(room, side);
	const theirs = rosterForSide(room, otherSide(side));
	const yourTurn = veto.next?.side === sideIndex(side);
	const kind = veto.next?.kind;
	const stepNumber = veto.complete ? DUEL_VETO_STEPS.length : veto.actions.length + 1;

	return (
		<section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6">
			<p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
				BO5 · map veto
			</p>
			<h3 className="mt-1 text-center text-xl font-semibold text-white">
				{veto.complete
					? "Veto complete"
					: yourTurn
						? kind === "ban"
							? "Ban a map"
							: "Pick a map"
						: `Waiting for ${theirs?.teamName ?? "opponent"}`}
			</h3>
			<p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-400">
				Ban, ban, pick, pick, then two more bans and picks. Your picks get the home boost. The
				leftover map is the decider.
			</p>
			<p className="mt-3 text-center text-xs text-zinc-500">
				{yours?.teamName ?? "You"} vs {theirs?.teamName ?? "Opponent"} · room {room.code}
			</p>
			<p className="mt-3 text-center text-xs text-zinc-400 sm:hidden">
				{veto.complete
					? "Veto complete"
					: `${kind === "ban" ? "Ban" : "Pick"} · step ${stepNumber} of ${DUEL_VETO_STEPS.length}`}
			</p>
			<ol className="mt-4 hidden flex-wrap justify-center gap-2 text-[11px] text-zinc-400 sm:flex">
				{DUEL_VETO_STEPS.map((step, index) => {
					const action = veto.actions[index];
					const yoursStep = step.side === sideIndex(side);
					const current = !veto.complete && veto.next === DUEL_VETO_STEPS[index];
					const stepId = VETO_STEP_IDS[index];
					return (
						<li
							key={stepId}
							className={`rounded-full border px-2.5 py-1 ${
								action
									? "border-white/10 bg-white/5"
									: current
										? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
										: "border-white/8 text-zinc-600"
							}`}
						>
							{step.kind === "ban" ? "Ban" : "Pick"} {yoursStep ? "you" : "them"}
							{action ? ` · ${action.mapId}` : null}
						</li>
					);
				})}
			</ol>
			<ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{MAP_POOL.map((map) => {
					const banned = veto.actions.some(
						(action) => action.mapId === map.id && action.kind === "ban",
					);
					const picked = veto.actions.find(
						(action) => action.mapId === map.id && action.kind === "pick",
					);
					const gone = banned || Boolean(picked);
					const enabled = yourTurn && !gone && !busy && !veto.complete;
					return (
						<li key={map.id}>
							<button
								type="button"
								disabled={!enabled}
								onClick={() => onPick(map.id)}
								className="group flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 text-left transition enabled:hover:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
							>
								<span className="relative block h-32 w-full overflow-hidden bg-zinc-800">
									<img
										src={map.background}
										alt=""
										loading="lazy"
										decoding="async"
										className="h-full w-full object-cover"
									/>
									<span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
									{banned ? (
										<span className="absolute inset-x-3 bottom-3 rounded-full bg-red-400/20 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-red-100">
											Banned
										</span>
									) : null}
									{picked ? (
										<span className="absolute inset-x-3 bottom-3 rounded-full bg-emerald-300/20 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-100">
											{picked.side === sideIndex(side)
												? "Your pick"
												: `${theirs?.teamName ?? "Their"} pick`}
										</span>
									) : null}
								</span>
								<span className="flex items-center justify-between gap-2 px-3 py-2.5">
									<span className="font-semibold text-white">{map.label}</span>
									<span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
										{STYLE_LABEL[map.style]}
									</span>
								</span>
							</button>
						</li>
					);
				})}
			</ul>
			{error ? (
				<p role="alert" className="mt-4 text-center text-sm text-red-200">
					{error}
				</p>
			) : null}
		</section>
	);
}
