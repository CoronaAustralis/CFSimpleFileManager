import { buildObjectKey, normalizeFileName, normalizeFolderPath } from "./http";

export function listAvailableR2Bindings(env: Env): string[] {
	return Object.entries(env)
		.filter(([, value]) => isR2Bucket(value))
		.map(([key]) => key)
		.sort((left, right) => left.localeCompare(right));
}

export function resolveBucketBinding(
	env: Env,
	bindingName: string,
): R2Bucket | null {
	const candidate = env[bindingName];
	return isR2Bucket(candidate) ? candidate : null;
}

export function isValidBindingName(value: string): boolean {
	return /^[A-Z][A-Z0-9_]{1,63}$/.test(value);
}

export function createFileLocation(
	folderPathValue: unknown,
	fileNameValue: unknown,
): { folderPath: string; fileName: string; objectKey: string } {
	const folderPath = normalizeFolderPath(folderPathValue);
	const fileName = normalizeFileName(fileNameValue);
	return {
		folderPath,
		fileName,
		objectKey: buildObjectKey(folderPath, fileName),
	};
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
	const buffer =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(digest))
		.map((item) => item.toString(16).padStart(2, "0"))
		.join("");
}

export function randomToken(prefix: string, length = 32): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	const alphabet =
		"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

	let result = prefix;
	for (const byte of bytes) {
		result += alphabet[byte % alphabet.length];
	}
	return result;
}

export function randomCode(length = 10): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

	let result = "";
	for (const byte of bytes) {
		result += alphabet[byte % alphabet.length];
	}
	return result;
}

function isR2Bucket(value: unknown): value is R2Bucket {
	if (!value || typeof value !== "object") {
		return false;
	}

	const bucket = value as R2Bucket;
	return (
		typeof bucket.get === "function" &&
		typeof bucket.put === "function" &&
		typeof bucket.delete === "function"
	);
}
