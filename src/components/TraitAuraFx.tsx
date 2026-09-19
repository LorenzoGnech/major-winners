import type { BonusPolarity } from "../engine";

type Orb = {
	left: string;
	delay: string;
	duration: string;
	size: string;
};

const ORBS: readonly Orb[] = [
	{ left: "6%", delay: "0ms", duration: "2.2s", size: "5px" },
	{ left: "18%", delay: "380ms", duration: "2.7s", size: "4px" },
	{ left: "31%", delay: "160ms", duration: "2.4s", size: "6px" },
	{ left: "46%", delay: "620ms", duration: "2.9s", size: "4px" },
	{ left: "60%", delay: "240ms", duration: "2.5s", size: "5px" },
	{ left: "73%", delay: "500ms", duration: "2.3s", size: "3px" },
	{ left: "85%", delay: "90ms", duration: "2.8s", size: "5px" },
	{ left: "94%", delay: "720ms", duration: "2.6s", size: "4px" },
];

const COMPACT_ORBS: readonly Orb[] = [
	{ left: "8%", delay: "0ms", duration: "2.1s", size: "3px" },
	{ left: "28%", delay: "280ms", duration: "2.5s", size: "4px" },
	{ left: "50%", delay: "120ms", duration: "2.2s", size: "3px" },
	{ left: "70%", delay: "400ms", duration: "2.4s", size: "4px" },
	{ left: "90%", delay: "200ms", duration: "2.3s", size: "3px" },
];

export function TraitAuraFx({
	polarity,
	compact = false,
}: {
	polarity: BonusPolarity;
	compact?: boolean;
}) {
	return (
		<span className="trait-orb-field" aria-hidden>
			{(compact ? COMPACT_ORBS : ORBS).map((orb) => (
				<span
					key={`${orb.left}-${orb.delay}`}
					className={`trait-orb ${polarity === "malus" ? "trait-orb-malus" : "trait-orb-bonus"}`}
					style={{
						left: orb.left,
						width: orb.size,
						height: orb.size,
						animationDelay: orb.delay,
						animationDuration: orb.duration,
					}}
				/>
			))}
		</span>
	);
}
