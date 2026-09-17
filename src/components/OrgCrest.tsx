import type { Org } from "../data";
import { orgCrestTone, orgInitials, orgLogoSrc } from "../data/orgLogo";

const SIZE_CLASS = {
	sm: "size-9 text-[11px]",
	md: "size-14 text-sm",
	lg: "size-16 text-base sm:size-20 sm:text-lg",
	xl: "size-24 text-lg sm:size-28 sm:text-xl",
} as const;

type OrgCrestProps = {
	org: Pick<Org, "id" | "name" | "logo">;
	size?: keyof typeof SIZE_CLASS;
	loading?: "lazy" | "eager";
};

export function OrgCrest({ org, size = "md", loading = "lazy" }: OrgCrestProps) {
	const src = orgLogoSrc(org);
	const tone = orgCrestTone(org.id);
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
			className={`flex shrink-0 items-center justify-center rounded-xl border border-white/10 font-bold tracking-wide ${SIZE_CLASS[size]}`}
			style={{ background: tone.background, color: tone.foreground }}
		>
			{orgInitials(org.name)}
		</div>
	);
}
