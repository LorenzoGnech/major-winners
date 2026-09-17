import {
	WEAPON_CLASS,
	WEAPON_ICON,
	WEAPON_LABEL,
	type WeaponClass,
	type WeaponId,
} from "../engine";

function Pistol() {
	return (
		<g fill="currentColor">
			<path d="M2 8.5h18.5v3.2H8.2L6 15.5H3.4L5.2 11.7H2z" />
			<path d="M20.5 7.2h8.2v4.6h-8.2z" />
			<path d="M28.5 8.4h6.2v2.2h-6.2z" />
		</g>
	);
}

const WIDTH: Record<WeaponClass, string> = {
	pistol: "w-9",
	deagle: "w-9",
	smg: "w-12",
	shotgun: "w-12",
	rifle: "w-14",
	lmg: "w-14",
	sniper: "w-16",
};

export function WeaponIcon({ weapon, className = "" }: { weapon: WeaponId; className?: string }) {
	const src = WEAPON_ICON[weapon];
	const box =
		`inline-flex h-5 ${WIDTH[WEAPON_CLASS[weapon]]} shrink-0 items-stretch ${className}`.trim();
	if (src) {
		return (
			<span
				role="img"
				aria-label={WEAPON_LABEL[weapon]}
				title={WEAPON_LABEL[weapon]}
				className={box}
			>
				<span
					aria-hidden
					className="block h-full w-full bg-current"
					style={{
						WebkitMaskImage: `url(${src})`,
						maskImage: `url(${src})`,
						WebkitMaskRepeat: "no-repeat",
						maskRepeat: "no-repeat",
						WebkitMaskPosition: "center",
						maskPosition: "center",
						WebkitMaskSize: "contain",
						maskSize: "contain",
					}}
				/>
			</span>
		);
	}
	return (
		<svg aria-label={WEAPON_LABEL[weapon]} viewBox="0 0 68 18" className={box}>
			<Pistol />
		</svg>
	);
}
