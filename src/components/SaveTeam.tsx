import { DEFAULT_AUTHOR_NAME, type PublishResult } from "../community";
import { parseTeamName } from "./teamName";

export function saveAuthorHint(signedIn: boolean, authorName: string): string {
	if (signedIn && authorName !== DEFAULT_AUTHOR_NAME) {
		return `Saves as ${authorName}.`;
	}
	if (signedIn) {
		return `Saves as ${DEFAULT_AUTHOR_NAME}. Set a username in My profile to show your name.`;
	}
	return `Saves as ${DEFAULT_AUTHOR_NAME}. Sign in to attach your username.`;
}

export function SaveTeamPanel({
	teamName,
	alreadySaved,
	busy,
	message,
	error,
	authorName,
	signedIn,
	onSave,
}: {
	teamName: string;
	alreadySaved: boolean;
	busy: boolean;
	message: string | null;
	error: string | null;
	authorName: string;
	signedIn: boolean;
	onSave: () => void;
}) {
	const savedName = parseTeamName(teamName) ?? teamName;

	if (alreadySaved) {
		return (
			<div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/8 p-4">
				<p className="text-sm font-semibold text-emerald-100">Team saved</p>
				<p className="mt-1 text-sm text-zinc-400">{savedName} is on the public boards.</p>
			</div>
		);
	}

	return (
		<form
			className="rounded-2xl border border-white/10 bg-black/25 p-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSave();
			}}
		>
			<p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-300">Save team</p>
			<p className="mt-1 text-sm text-zinc-400">
				Save {savedName} to the leaderboards and the Versus pool.
			</p>
			<p className="mt-3 text-sm text-zinc-400">{saveAuthorHint(signedIn, authorName)}</p>
			<button
				type="submit"
				disabled={busy}
				className="mt-3 w-full border border-transparent bg-[#e53935] px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#f04848] disabled:opacity-50"
			>
				{busy ? "Saving…" : "Save team"}
			</button>
			{error ? (
				<p role="alert" className="mt-2 text-xs text-red-300">
					{error}
				</p>
			) : null}
			{message ? <p className="mt-2 text-xs text-emerald-200">{message}</p> : null}
		</form>
	);
}

export function saveResultMessage(result: PublishResult): string | null {
	if (!result.ok) return null;
	return result.duplicate ? "This run was already saved." : "Saved to the boards.";
}
