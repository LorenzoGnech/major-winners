const DEFAULT_DONATE_URL = "https://ko-fi.com/majorwinners";

export function donateUrl(): string {
	return import.meta.env.PUBLIC_DONATE_URL?.trim() || DEFAULT_DONATE_URL;
}
