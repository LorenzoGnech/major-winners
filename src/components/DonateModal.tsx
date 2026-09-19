import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type CryptoWallet, copyText, donateOptions, formatWalletAddress } from "./donate";

type DonateModalProps = {
	open: boolean;
	onClose: () => void;
};

function CoffeeIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
			<path
				fill="currentColor"
				d="M3.75 6.5h12.5v6.25a4.75 4.75 0 0 1-4.75 4.75H8.5a4.75 4.75 0 0 1-4.75-4.75zm13.25 1.25h1.1A3.4 3.4 0 0 1 21.5 11.15a3.4 3.4 0 0 1-3.4 3.4h-1.1zM7 19.25h8.25a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1 0-1.5z"
			/>
		</svg>
	);
}

function ChainIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
			<path
				fill="currentColor"
				d="M10.2 16.4 8.8 17.8a3.2 3.2 0 0 1-4.6-4.6l2.4-2.4a3.2 3.2 0 0 1 4.6 0l.4.4-.9.9-.4-.4a1.9 1.9 0 0 0-2.7 0L5.2 14a1.9 1.9 0 0 0 2.7 2.7l1.4-1.4zm3.6-8.8 1.4-1.4a3.2 3.2 0 1 1 4.6 4.6l-2.4 2.4a3.2 3.2 0 0 1-4.6 0l-.4-.4.9-.9.4.4a1.9 1.9 0 0 0 2.7 0L18.8 10a1.9 1.9 0 0 0-2.7-2.7l-1.4 1.4zM8.7 14.4l5.7-5.7.9.9-5.7 5.7z"
			/>
		</svg>
	);
}

function SkinIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
			<path
				fill="currentColor"
				d="M3.2 18.6 13.4 4.8a1.4 1.4 0 0 1 2.2-.15l3.75 3.75a1.4 1.4 0 0 1-.15 2.2L9.4 20.8a1.6 1.6 0 0 1-1.15.45H3.9a.7.7 0 0 1-.7-.7v-1.2c0-.4.16-.78.44-1.06zM14.2 6.4 5 18.75V19.3h.7L17.6 9.8z"
			/>
		</svg>
	);
}

function MethodCard({
	icon,
	title,
	detail,
	children,
}: {
	icon: ReactNode;
	title: string;
	detail: string;
	children: ReactNode;
}) {
	return (
		<section className="rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-left">
			<div className="flex items-start gap-2.5">
				<span className="mt-0.5 text-amber-100">{icon}</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
						{title}
					</h3>
					<p className="mt-1 text-xs leading-5 text-zinc-400">{detail}</p>
					<div className="mt-3">{children}</div>
				</div>
			</div>
		</section>
	);
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center justify-center rounded-lg border border-amber-200/25 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-200/45 hover:bg-amber-300/16 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
		>
			{children}
		</a>
	);
}

function WalletRow({ wallet }: { wallet: CryptoWallet }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => {
		return () => window.clearTimeout(timer.current);
	}, []);

	async function copy() {
		const ok = await copyText(wallet.address);
		if (!ok) return;
		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1600);
	}

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/25 px-2.5 py-2">
			<div className="min-w-0">
				<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
					{wallet.label}
				</p>
				<p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400" title={wallet.address}>
					{formatWalletAddress(wallet.address)}
				</p>
			</div>
			<button
				type="button"
				onClick={() => void copy()}
				className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200 transition hover:border-white/40 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

function WalletList({ wallets }: { wallets: readonly CryptoWallet[] }) {
	const funded = wallets.filter((wallet) => wallet.address.length > 0);
	if (funded.length === 0) {
		return (
			<div className="flex flex-wrap gap-1.5">
				{wallets.map((wallet) => (
					<span
						key={wallet.id}
						className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400"
					>
						{wallet.label}
					</span>
				))}
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-1.5">
			{funded.map((wallet) => (
				<WalletRow key={wallet.id} wallet={wallet} />
			))}
		</div>
	);
}

export function DonateModal({ open, onClose }: DonateModalProps) {
	const titleId = useId();
	const closeRef = useRef<HTMLButtonElement>(null);
	const options = donateOptions();
	const wallets = options.crypto;

	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement;
		closeRef.current?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[80] flex items-end justify-center px-4 py-6 sm:items-center">
			<button
				type="button"
				aria-label="Close donate options"
				className="absolute inset-0 bg-black/65 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="relative max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-zinc-950/92 px-4 py-5 shadow-[0_24px_80px_rgb(0_0_0_/_0.55)] backdrop-blur-xl sm:px-5"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
							Major Winners
						</p>
						<h2
							id={titleId}
							className="mt-1 text-lg font-bold uppercase tracking-[0.14em] text-white"
						>
							Buy me a coffee
						</h2>
						<p className="mt-2 text-xs leading-5 text-zinc-400">
							Optional support. Play stays free either way.
						</p>
					</div>
					<button
						ref={closeRef}
						type="button"
						onClick={onClose}
						className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
					>
						Close
					</button>
				</div>

				<div className="mt-4 flex flex-col gap-2.5">
					<MethodCard
						icon={<CoffeeIcon />}
						title="Card or PayPal"
						detail="Thank you <3"
					>
						<ActionLink href={options.kofiUrl}>Open</ActionLink>
					</MethodCard>

					<MethodCard
						icon={<ChainIcon />}
						title="Crypto"
						detail="Send Bitcoin, Ethereum, or Solana to a receive address."
					>
						<WalletList wallets={wallets} />
					</MethodCard>

					<MethodCard
						icon={<SkinIcon />}
						title="CS skins"
						detail="Send a skin through Steam. Thank you <3"
					>
						{options.skinsTradeUrl ? (
							<ActionLink href={options.skinsTradeUrl}>Open trade offer</ActionLink>
						) : null}
					</MethodCard>
				</div>
			</div>
		</div>
	);
}
