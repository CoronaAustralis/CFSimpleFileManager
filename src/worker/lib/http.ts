import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonSuccess<T>(c: Context, data: T, status = 200) {
	return c.json({ ok: true, data }, status as ContentfulStatusCode);
}

export function jsonError(c: Context, status: number, message: string) {
	return c.json(
		{
			ok: false,
			error: {
				message,
			},
		},
		status as ContentfulStatusCode,
	);
}

export function parseInteger(
	value: string | undefined | null,
): number | null {
	if (!value) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function parseBooleanLike(value: unknown): boolean {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
		return value !== 0;
	}

	if (typeof value !== "string") {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function normalizeFolderPath(value: unknown): string {
	if (typeof value !== "string") {
		return "";
	}

	const trimmed = value.trim().replace(/\\/g, "/");
	if (!trimmed) {
		return "";
	}

	return trimmed
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean)
		.join("/");
}

export function normalizeFileName(value: unknown): string {
	if (typeof value !== "string") {
		return "";
	}

	return value.replace(/[\\/]+/g, " ").trim();
}

export function buildObjectKey(folderPath: string, fileName: string): string {
	return folderPath ? `${folderPath}/${fileName}` : fileName;
}

export function parentFolderPath(folderPath: string): string | null {
	if (!folderPath) {
		return null;
	}

	const parts = folderPath.split("/");
	parts.pop();
	return parts.join("/") || "";
}

export function formatAttachmentHeader(fileName: string): string {
	return `attachment; filename*=UTF-8''${encodeRFC5987ValueChars(fileName)}`;
}

function encodeRFC5987ValueChars(value: string): string {
	return encodeURIComponent(value)
		.replace(/['()]/g, escape)
		.replace(/\*/g, "%2A")
		.replace(/%(7C|60|5E)/g, unescape);
}
