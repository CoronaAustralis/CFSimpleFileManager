import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { verify, sign } from "hono/jwt";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { ensureDatabase, unixTime } from "./db";
import { jsonError } from "./http";
import { sha256Hex } from "./storage";

const SESSION_COOKIE = "cfm_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export interface AuthState {
	username: "admin";
	authMethod: "session" | "token";
	tokenId?: number;
	expiresAt?: number;
}

export type AppContext = {
	Bindings: Env;
	Variables: {
		auth: AuthState | null;
	};
};

interface SessionPayload {
	sub: "admin";
	type: "session";
	iat: number;
	exp: number;
}

interface TokenRow {
	id: number;
	status: number;
}

export const authMiddleware = createMiddleware<AppContext>(async (c, next) => {
	await ensureDatabase(c.env.DB);
	c.set("auth", null);
	const authSecret = getAuthSecret(c.env);

	const authorization = c.req.header("Authorization");
	if (authorization?.startsWith("Bearer ")) {
		const rawToken = authorization.slice("Bearer ".length).trim();
		if (rawToken) {
			const tokenHash = await hashSecret(rawToken, authSecret);
			const tokenRow = await c.env.DB
				.prepare(
					"SELECT id, status FROM api_tokens WHERE token_hash = ? LIMIT 1",
				)
				.bind(tokenHash)
				.first<TokenRow>();

			if (tokenRow?.status === 1) {
				const now = unixTime();
				c.executionCtx.waitUntil(
					c.env.DB
						.prepare(
							"UPDATE api_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?",
						)
						.bind(now, now, tokenRow.id)
						.run(),
				);
				c.set("auth", {
					username: "admin",
					authMethod: "token",
					tokenId: tokenRow.id,
				});
				await next();
				return;
			}
		}
	}

	const sessionCookie = getCookie(c, SESSION_COOKIE);
	if (sessionCookie) {
		try {
			const payload = (await verify(
				sessionCookie,
				authSecret,
				"HS256",
			)) as unknown as SessionPayload;

			if (payload.sub === "admin" && payload.type === "session") {
				c.set("auth", {
					username: "admin",
					authMethod: "session",
					expiresAt: payload.exp,
				});
			}
		} catch {
			deleteCookie(c, SESSION_COOKIE, { path: "/" });
		}
	}

	await next();
});

export function requireAuth(c: Context<AppContext>): AuthState | Response {
	const auth = c.get("auth");
	if (!auth) {
		return jsonError(c, 401, "Authentication required.");
	}

	return auth;
}

export async function issueSession(c: Context<AppContext>): Promise<number> {
	const iat = unixTime();
	const exp = iat + SESSION_DURATION_SECONDS;
	const authSecret = getAuthSecret(c.env);
	const token = await sign(
		{
			sub: "admin",
			type: "session",
			iat,
			exp,
		} satisfies SessionPayload,
		authSecret,
	);

	setCookie(c, SESSION_COOKIE, token, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_DURATION_SECONDS,
	});

	return exp;
}

export function clearSession(c: Context<AppContext>) {
	deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function checkAdminPassword(
	password: string,
	env: Env,
): Promise<boolean> {
	if (!env.ADMIN_PASSWORD) {
		return false;
	}

	const authSecret = getAuthSecret(env);
	const [provided, expected] = await Promise.all([
		hashSecret(password, authSecret),
		hashSecret(env.ADMIN_PASSWORD, authSecret),
	]);

	return provided === expected;
}

export async function hashSecret(
	rawValue: string,
	secret: string,
): Promise<string> {
	return sha256Hex(`${secret}:${rawValue}`);
}

export function getAuthSecret(env: Env): string {
	const explicitSecret =
		typeof env.AUTH_SECRET === "string" ? env.AUTH_SECRET.trim() : "";
	const adminPassword =
		typeof env.ADMIN_PASSWORD === "string" ? env.ADMIN_PASSWORD.trim() : "";

	return explicitSecret || adminPassword;
}

export async function encryptStoredToken(
	rawToken: string,
	secret: string,
): Promise<string> {
	const key = await createTokenCryptoKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipherBuffer = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(rawToken),
	);

	return `${bytesToHex(iv)}.${bytesToHex(new Uint8Array(cipherBuffer))}`;
}

export async function decryptStoredToken(
	encryptedToken: string,
	secret: string,
): Promise<string> {
	const [ivHex, cipherHex] = encryptedToken.split(".");
	if (!ivHex || !cipherHex) {
		throw new Error("Invalid stored token payload.");
	}

	const key = await createTokenCryptoKey(secret);
	const plainBuffer = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: hexToBytes(ivHex) },
		key,
		hexToBytes(cipherHex),
	);

	return new TextDecoder().decode(plainBuffer);
}

async function createTokenCryptoKey(secret: string): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`cfm-token-secret:${secret}`),
	);

	return crypto.subtle.importKey(
		"raw",
		keyMaterial,
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function hexToBytes(value: string): Uint8Array {
	if (value.length % 2 !== 0) {
		throw new Error("Invalid hex payload.");
	}

	const bytes = new Uint8Array(value.length / 2);
	for (let index = 0; index < value.length; index += 2) {
		bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
	}

	return bytes;
}
