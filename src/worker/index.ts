import { Hono } from "hono";
import { authMiddleware, type AppContext } from "./lib/auth";
import { jsonError } from "./lib/http";
import { authRoutes } from "./routes/auth";
import { bucketRoutes } from "./routes/buckets";
import { fileRoutes, shareRoutes } from "./routes/files";
import { tokenRoutes } from "./routes/tokens";

const app = new Hono<AppContext>();

app.use("*", authMiddleware);

app.onError((error, c) => {
	console.error(error);
	return jsonError(c, 500, "Internal server error.");
});

app.get("/", (c) => c.redirect(`/${__WEB_LOCATION__}/`));

app.route("/api/auth", authRoutes);
app.route("/api/tokens", tokenRoutes);
app.route("/api/buckets", bucketRoutes);
app.route("/api/files", fileRoutes);
app.route("/s", shareRoutes);

app.get(`/${__WEB_LOCATION__}/*`, async (c) => {
	const requestedPath = c.req.path.replace(`/${__WEB_LOCATION__}/`, "");
	const assetResponse = await c.env.ASSETS.fetch(
		`https://assets.local/${requestedPath}`,
	);
	if (assetResponse.status === 404) {
		return c.env.ASSETS.fetch("https://assets.local/index.html");
	}
	return assetResponse;
});

app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) {
		return jsonError(c, 404, "Route not found.");
	}

	return c.redirect(`/${__WEB_LOCATION__}/`);
});

export default app;
