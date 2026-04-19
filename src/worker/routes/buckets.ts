import { Hono } from "hono";
import { AppContext, requireAuth } from "../lib/auth";
import {
	getAllBuckets,
	getBucketByBindingName,
	getBucketByName,
	getDefaultBucket,
	unixTime,
} from "../lib/db";
import { jsonError, jsonSuccess } from "../lib/http";
import { resolveBucketBinding } from "../lib/storage";

export const bucketRoutes = new Hono<AppContext>();

bucketRoutes.get("/", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const buckets = await getAllBuckets(c.env.DB);
	return jsonSuccess(c, {
		buckets: buckets.map((bucket) => ({
			id: bucket.id,
			bucket_name: bucket.bucket_name,
			preview_bucket_name: bucket.preview_bucket_name,
			is_default: bucket.is_default,
		})),
	});
});

bucketRoutes.post("/", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	let payload:
		| {
				binding_name?: string;
				bucket_name?: string;
				preview_bucket_name?: string | null;
		  }
		| null = null;
	try {
		payload = await c.req.json<{
			binding_name?: string;
			bucket_name?: string;
			preview_bucket_name?: string | null;
		}>();
	} catch {
		return jsonError(c, 400, "Invalid bucket payload.");
	}

	const bindingName = normalizeBindingName(payload?.binding_name);
	if (!bindingName) {
		return jsonError(
			c,
			400,
			"Binding name is required and may only contain letters, numbers, underscores, or hyphens.",
		);
	}

	const bucketName = normalizeBucketName(payload?.bucket_name);
	if (!bucketName) {
		return jsonError(
			c,
			400,
			"Bucket name is required and may only contain letters, numbers, dots, underscores, or hyphens.",
		);
	}

	const previewBucketName = normalizeOptionalBucketName(
		payload?.preview_bucket_name,
	);
	if (payload?.preview_bucket_name && !previewBucketName) {
		return jsonError(
			c,
			400,
			"Preview bucket name may only contain letters, numbers, dots, underscores, or hyphens.",
		);
	}

	const storage = resolveBucketBinding(c.env, bindingName);
	if (!storage) {
		return jsonError(
			c,
			400,
			"Cannot read this bucket binding. Please bind this R2 bucket to the Worker in Cloudflare first.",
		);
	}

	try {
		await storage.list({ limit: 1 });
	} catch {
		return jsonError(
			c,
			400,
			"Cannot read this bucket binding yet. Please confirm the Worker is bound to it in Cloudflare, then try again.",
		);
	}

	const now = unixTime();
	const existingByBinding = await getBucketByBindingName(c.env.DB, bindingName);
	const existingByName = await getBucketByName(c.env.DB, bucketName);
	if (
		existingByBinding &&
		existingByName &&
		existingByBinding.id !== existingByName.id
	) {
		const staleCandidates = [existingByBinding, existingByName].filter(
			(bucket) => bucket.is_enabled !== 1,
		);
		const activeCandidates = [existingByBinding, existingByName].filter(
			(bucket) => bucket.is_enabled === 1,
		);

		if (staleCandidates.length > 0) {
			for (const staleBucket of staleCandidates) {
				await c.env.DB
					.prepare("DELETE FROM storage_buckets WHERE id = ?")
					.bind(staleBucket.id)
					.run();
			}
		} else if (activeCandidates.length > 1) {
			return jsonError(
				c,
				409,
				"This binding name or bucket name is already used by another saved bucket.",
			);
		}
	}

	const existing =
		(await getBucketByBindingName(c.env.DB, bindingName)) ??
		(await getBucketByName(c.env.DB, bucketName));
	const defaultBucket = await getDefaultBucket(c.env.DB);

	if (existing) {
		const nextDefault = existing.is_default === 1 || !defaultBucket ? 1 : 0;
		await c.env.DB
			.prepare(
				"UPDATE storage_buckets SET binding_name = ?, bucket_name = ?, preview_bucket_name = ?, label = ?, is_default = ?, is_enabled = 1, updated_at = ? WHERE id = ?",
			)
			.bind(
				bindingName,
				bucketName,
				previewBucketName,
				bucketName,
				nextDefault,
				now,
				existing.id,
			)
			.run();
	} else {
		await c.env.DB
			.prepare(
				"INSERT INTO storage_buckets (binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				bindingName,
				bucketName,
				previewBucketName,
				bucketName,
				defaultBucket ? 0 : 1,
				1,
				now,
				now,
			)
			.run();
	}

	const bucket =
		(await getBucketByBindingName(c.env.DB, bindingName)) ??
		(await getBucketByName(c.env.DB, bucketName));
	if (!bucket) {
		return jsonError(c, 500, "Bucket could not be saved.");
	}

	return jsonSuccess(
		c,
		{
			bucket: {
				id: bucket.id,
				bucket_name: bucket.bucket_name,
				preview_bucket_name: bucket.preview_bucket_name,
				is_default: bucket.is_default,
			},
		},
		existing ? 200 : 201,
	);
});

bucketRoutes.delete("/:id", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const bucketId = Number.parseInt(c.req.param("id"), 10);
	if (!Number.isInteger(bucketId) || bucketId <= 0) {
		return jsonError(c, 400, "Invalid bucket id.");
	}

	const bucket = await c.env.DB
		.prepare(
			"SELECT id, bucket_name, is_default, is_enabled FROM storage_buckets WHERE id = ? LIMIT 1",
		)
		.bind(bucketId)
		.first<{
			id: number;
			bucket_name: string;
			is_default: number;
			is_enabled: number;
		}>();
	if (!bucket) {
		return jsonError(c, 404, "Bucket not found.");
	}

	if (bucket.is_default === 1) {
		return jsonError(c, 400, "The default bucket cannot be deleted.");
	}

	await c.env.DB
		.prepare("DELETE FROM storage_buckets WHERE id = ?")
		.bind(bucket.id)
		.run();

	return jsonSuccess(c, {
		deleted: true,
		id: bucket.id,
	});
});

function normalizeBucketName(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	if (!normalized || !/^[A-Za-z0-9._-]{1,63}$/.test(normalized)) {
		return null;
	}

	return normalized;
}

function normalizeOptionalBucketName(value: unknown): string | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}

	return normalizeBucketName(value);
}

function normalizeBindingName(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	if (!normalized || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(normalized)) {
		return null;
	}

	return normalized;
}
