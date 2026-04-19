import { Hono } from "hono";
import {
	AppContext,
	decryptStoredToken,
	encryptStoredToken,
	getAuthSecret,
	hashSecret,
	requireAuth,
} from "../lib/auth";
import { unixTime } from "../lib/db";
import { jsonError, jsonSuccess, parseInteger } from "../lib/http";
import { randomToken } from "../lib/storage";

interface TokenListRow {
	id: number;
	name: string;
	token_prefix: string;
	status: number;
	last_used_at: number | null;
	created_at: number;
	updated_at: number;
}

export const tokenRoutes = new Hono<AppContext>();

tokenRoutes.get("/", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const result = await c.env.DB
		.prepare(
			"SELECT id, name, token_prefix, status, last_used_at, created_at, updated_at FROM api_tokens ORDER BY created_at DESC",
		)
		.all<TokenListRow>();

	return jsonSuccess(c, {
		tokens: result.results.map((row) => ({
			id: row.id,
			name: row.name,
			token_prefix: row.token_prefix,
			is_active: row.status === 1,
			last_used_at: row.last_used_at,
			created_at: row.created_at,
			updated_at: row.updated_at,
		})),
	});
});

tokenRoutes.post("/", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	let payload: { name?: string } | null = null;
	try {
		payload = await c.req.json<{ name?: string }>();
	} catch {
		return jsonError(c, 400, "Invalid token payload.");
	}

	const name = payload?.name?.trim();
	if (!name) {
		return jsonError(c, 400, "Token name is required.");
	}

	const token = randomToken("cfm_", 28);
	const tokenPrefix = token.slice(0, 12);
	const authSecret = getAuthSecret(c.env);
	const [tokenHash, tokenSecretEncrypted] = await Promise.all([
		hashSecret(token, authSecret),
		encryptStoredToken(token, authSecret),
	]);
	const now = unixTime();

	const inserted = await c.env.DB
		.prepare(
			"INSERT INTO api_tokens (name, token_hash, token_secret_encrypted, token_prefix, status, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(name, tokenHash, tokenSecretEncrypted, tokenPrefix, 1, null, now, now)
		.run();

	return jsonSuccess(
		c,
		{
			id: Number(inserted.meta.last_row_id ?? 0),
			name,
			token,
			token_prefix: tokenPrefix,
		},
		201,
	);
});

tokenRoutes.post("/:id/rotate", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const id = parseInteger(c.req.param("id"));
	if (!id) {
		return jsonError(c, 400, "Invalid token id.");
	}

	const existing = await c.env.DB
		.prepare("SELECT id, name FROM api_tokens WHERE id = ? LIMIT 1")
		.bind(id)
		.first<{ id: number; name: string }>();

	if (!existing) {
		return jsonError(c, 404, "Token not found.");
	}

	const token = randomToken("cfm_", 28);
	const tokenPrefix = token.slice(0, 12);
	const authSecret = getAuthSecret(c.env);
	const [tokenHash, tokenSecretEncrypted] = await Promise.all([
		hashSecret(token, authSecret),
		encryptStoredToken(token, authSecret),
	]);
	const now = unixTime();

	await c.env.DB
		.prepare(
			"UPDATE api_tokens SET token_hash = ?, token_secret_encrypted = ?, token_prefix = ?, status = 1, updated_at = ? WHERE id = ?",
		)
		.bind(tokenHash, tokenSecretEncrypted, tokenPrefix, now, id)
		.run();

	return jsonSuccess(c, {
		id,
		name: existing.name,
		token,
		token_prefix: tokenPrefix,
	});
});

tokenRoutes.get("/:id/secret", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const id = parseInteger(c.req.param("id"));
	if (!id) {
		return jsonError(c, 400, "Invalid token id.");
	}

	const row = await c.env.DB
		.prepare(
			"SELECT id, name, token_prefix, token_secret_encrypted FROM api_tokens WHERE id = ? LIMIT 1",
		)
		.bind(id)
		.first<{
			id: number;
			name: string;
			token_prefix: string;
			token_secret_encrypted: string | null;
		}>();

	if (!row) {
		return jsonError(c, 404, "Token not found.");
	}

	if (!row.token_secret_encrypted) {
		return jsonError(
			c,
			409,
			"This token was created before display support was added. Rotate it once to enable reveal.",
		);
	}

	let token = "";
	try {
		token = await decryptStoredToken(row.token_secret_encrypted, getAuthSecret(c.env));
	} catch {
		return jsonError(
			c,
			409,
			"This token can no longer be displayed. Rotate it once to generate a new visible value.",
		);
	}

	return jsonSuccess(c, {
		id: row.id,
		name: row.name,
		token,
		token_prefix: row.token_prefix,
	});
});

tokenRoutes.delete("/:id", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const id = parseInteger(c.req.param("id"));
	if (!id) {
		return jsonError(c, 400, "Invalid token id.");
	}

	const now = unixTime();
	await c.env.DB
		.prepare("UPDATE api_tokens SET status = 0, updated_at = ? WHERE id = ?")
		.bind(now, id)
		.run();

	return jsonSuccess(c, { id, disabled: true });
});
