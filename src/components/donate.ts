const DEFAULT_DONATE_URL = "https://ko-fi.com/majorwinners";

export type CryptoWallet = {
	id: string;
	label: string;
	address: string;
};

export type DonateOptions = {
	kofiUrl: string;
	crypto: readonly CryptoWallet[];
	skinsTradeUrl: string | null;
};

const DONATE_CRYPTO: readonly CryptoWallet[] = [
	{ id: "btc", label: "Bitcoin", address: "bc1qcsr5zwnnf75k7r4hdx3uazevnmz9h3vgv5ymux" },
	{ id: "eth", label: "Ethereum", address: "0xaBF19795f84aF924884b31Bdc16D7eBe434B9eD9" },
	{ id: "sol", label: "Solana", address: "2qAWr5bqe34yGR6x8g6DXJgcsAuSKbLysradcr3fM6Vb" },
];

const DONATE_SKINS_TRADE_URL =
	"https://steamcommunity.com/tradeoffer/new/?partner=163311756&token=V8V-aJWj";

export function httpUrl(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol === "http:" || url.protocol === "https:") return trimmed;
	} catch {
		return null;
	}
	return null;
}

export function donateUrl(): string {
	return httpUrl(import.meta.env.PUBLIC_DONATE_URL) ?? DEFAULT_DONATE_URL;
}

export function donateOptions(): DonateOptions {
	return {
		kofiUrl: donateUrl(),
		crypto: DONATE_CRYPTO,
		skinsTradeUrl: httpUrl(DONATE_SKINS_TRADE_URL),
	};
}

export function formatWalletAddress(address: string): string {
	const trimmed = address.trim();
	if (trimmed.length <= 16) return trimmed;
	return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

export async function copyText(text: string): Promise<boolean> {
	try {
		if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
		if (typeof document === "undefined") return false;
		const field = document.createElement("textarea");
		field.value = text;
		field.setAttribute("readonly", "");
		field.style.position = "fixed";
		field.style.opacity = "0";
		document.body.appendChild(field);
		field.select();
		const copied = document.execCommand("copy");
		field.remove();
		return copied;
	} catch {
		return false;
	}
}
