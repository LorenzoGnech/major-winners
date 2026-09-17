import { type BonusId, bonusById } from "../engine/bonuses";

export function TraitBadge({ id }: { id: BonusId }) {
	const trait = bonusById(id);
	const malus = trait.polarity === "malus";
	return (
		<span
			title={`${trait.name}. ${trait.blurb}`}
			className={`inline-flex max-w-full items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${
				malus
					? "trait-glow-malus border-red-400/55 bg-red-500/15 text-red-100"
					: "trait-glow-bonus border-emerald-400/55 bg-emerald-500/15 text-emerald-100"
			}`}
		>
			<img src={trait.icon} alt="" className="size-5 shrink-0" />
			<span className="leading-none">{trait.name}</span>
		</span>
	);
}

export function TraitIcons({ ids }: { ids: readonly BonusId[] }) {
	if (ids.length === 0) return null;
	return (
		<span className="flex items-center gap-1">
			{ids.map((id) => {
				const trait = bonusById(id);
				return (
					<img
						key={id}
						src={trait.icon}
						alt={trait.name}
						title={`${trait.name}. ${trait.blurb}`}
						className="size-4"
					/>
				);
			})}
		</span>
	);
}
