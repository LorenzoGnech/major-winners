import type { BonusPolarity } from "../engine";

type TraitAuraFxProps = {
	polarity: BonusPolarity;
	compact?: boolean;
};

export function TraitAuraFx({ polarity, compact = false }: TraitAuraFxProps) {
	return (
		<span
			className={`trait-aura ${polarity === "malus" ? "trait-aura-malus" : "trait-aura-bonus"} ${
				compact ? "trait-aura-compact" : ""
			}`}
			aria-hidden
		>
			{polarity === "malus" ? (
				<>
					<span className="trait-arrow" />
					<span className="trait-arrow" />
					<span className="trait-arrow" />
					<span className="trait-arrow" />
				</>
			) : (
				<>
					<span className="trait-flame" />
					<span className="trait-flame" />
					<span className="trait-flame" />
					<span className="trait-flame" />
					<span className="trait-flame" />
				</>
			)}
		</span>
	);
}
