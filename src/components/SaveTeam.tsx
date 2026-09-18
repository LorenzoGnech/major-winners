import { useState } from "react";
import {
	AUTHOR_NAME_MAX,
	DEFAULT_AUTHOR_NAME,
	type PublishResult,
	parseAuthorName,
} from "../community";
import { parseTeamName } from "./teamName";

const FIELD_CLASS =
	"mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";

export function SaveTeamPanel({
	teamName,
	alreadySaved,
	busy,
	message,
	error,
	onSave,
}: {
	teamName: string;
	alreadySaved: boolean;
	busy: boolean;
	message: string | null;
	error: string | null;
	onSave: (authorName: string) => void;
}) {
	const [authorDraft, setAuthorDraft] = useState("");
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
				onSave(parseAuthorName(authorDraft));
			}}
		>
			<p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-300">Save team</p>
			<p className="mt-1 text-sm text-zinc-400">
				Publish {savedName} to the home leaderboards and the Versus community pool.
			</p>
			<label
				htmlFor="save-author"
				className="mt-3 block text-xs uppercase tracking-wider text-zinc-500"
			>
				Your name
			</label>
			<input
				id="save-author"
				value={authorDraft}
				maxLength={AUTHOR_NAME_MAX}
				autoComplete="nickname"
				placeholder={DEFAULT_AUTHOR_NAME}
				onChange={(event) => setAuthorDraft(event.target.value)}
				className={FIELD_CLASS}
			/>
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
	return result.duplicate ? "This run was already published." : "Saved to the community boards.";
}
