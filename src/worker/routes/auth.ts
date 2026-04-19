import { Hono } from "hono";
import {
	AppContext,
	checkAdminPassword,
	clearSession,
	issueSession,
	requireAuth,
} from "../lib/auth";
import { jsonError, jsonSuccess } from "../lib/http";

export const authRoutes = new Hono<AppContext>();

authRoutes.post("/login", async (c) => {
	let payload: { password?: string } | null = null;
	try {
		payload = await c.req.json<{ password?: string }>();
	} catch {
		return jsonError(c, 400, "Invalid login payload.");
	}

	if (!payload?.password) {
		return jsonError(c, 400, "Password is required.");
	}

	const passwordOk = await checkAdminPassword(payload.password, c.env);
	if (!passwordOk) {
		return jsonError(c, 401, "Incorrect password.");
	}

	const expiresAt = await issueSession(c);
	return jsonSuccess(c, {
		username: "admin" as const,
		auth_method: "session" as const,
		expires_at: expiresAt,
	});
});

authRoutes.post("/logout", (c) => {
	clearSession(c);
	return jsonSuccess(c, { logged_out: true });
});

authRoutes.get("/me", (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	return jsonSuccess(c, {
		username: auth.username,
		auth_method: auth.authMethod,
		expires_at: auth.expiresAt ?? null,
	});
});
