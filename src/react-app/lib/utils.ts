export async function copyText(text: string) {
	await navigator.clipboard.writeText(text);
}

export function formatBytes(size: number): string {
	if (size < 1024) {
		return `${size} B`;
	}

	const units = ["KB", "MB", "GB", "TB"];
	let value = size;
	let unitIndex = -1;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatTimestamp(
	value: number | null,
	locale: string,
): string {
	if (!value) {
		return "—";
	}

	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(value * 1000);
}

export function toUnixTimestamp(value: string): number | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	const timestamp = Math.floor(date.getTime() / 1000);
	return Number.isFinite(timestamp) ? timestamp : null;
}

export function toDateTimeLocal(value: number | null): string {
	if (!value) {
		return "";
	}

	const date = new Date(value * 1000);
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return local.toISOString().slice(0, 16);
}
