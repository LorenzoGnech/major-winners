import type { Major } from "../data";
import { majorInitials, majorLogoSrc } from "../data/majorLogo";
import { orgCrestTone } from "../data/orgLogo";

const SIZE_CLASS = {
	sm: "h-9 w-14 text-[10px]",
	md: "h-11 w-[4.5rem] text-xs",
	lg: "h-14 w-24 text-sm sm:h-16 sm:w-28",
	xl: "size-14 text-sm sm:size-24 sm:text-lg lg:size-28 lg:text-xl",
} as const;

type MajorCrestProps = {
	major: Pick<Major, "id" | "shortName" | "logo">;
	size?: keyof typeof SIZE_CLASS;
	loading?: "lazy" | "eager";
};

export function MajorCrest({ major, size = "md", loading = "lazy" }: MajorCrestProps) {
	const src = majorLogoSrc(major);
	const tone = orgCrestTone(major.id);
	if (src) {
		return (
			<img
				src={src}
				alt=""
				loading={loading}
				decoding="async"
				className={`shrink-0 object-contain ${SIZE_CLASS[size]}`}
			/>
		);
	}
	return (
		<div
			aria-hidden
			className={`flex shrink-0 items-center justify-center rounded-lg border border-white/10 font-bold tracking-wide ${SIZE_CLASS[size]}`}
			style={{ background: tone.background, color: tone.foreground }}
		>
			{majorInitials(major.shortName)}
		</div>
	);
}
