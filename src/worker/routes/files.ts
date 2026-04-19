import { Hono } from "hono";
import { AppContext, requireAuth } from "../lib/auth";
import {
	createUniqueShareCode,
	ensureTrackedFile,
	getJoinedFile,
	getJoinedFileByLocation,
	getShareByCode,
	listFiles,
	resolveFileReference,
	serializeFile,
	serializeTrackedFile,
	splitObjectKey,
	streamResolvedFile,
} from "../lib/files";
import {
	getAllBuckets,
	getBucketById,
	getDefaultBucket,
	unixTime,
} from "../lib/db";
import {
	buildObjectKey,
	jsonError,
	jsonSuccess,
	normalizeFileName,
	normalizeFolderPath,
	parseBooleanLike,
	parseInteger,
} from "../lib/http";
import { resolveBucketBinding, sha256Hex } from "../lib/storage";

export const fileRoutes = new Hono<AppContext>();
export const shareRoutes = new Hono<AppContext>();

fileRoutes.get("/", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const requestedBucketId = parseInteger(c.req.query("bucket_id"));
	const currentFolder = normalizeFolderPath(c.req.query("folder_path"));
	const bucket = requestedBucketId
		? await getBucketById(c.env.DB, requestedBucketId)
		: await getDefaultBucket(c.env.DB);

	if (!bucket) {
		return jsonError(c, 404, "No storage bucket has been configured.");
	}

	const { files, folders, parentFolder } = await listFiles(
		c.env,
		c.env.DB,
		bucket,
		currentFolder,
	);
	const buckets = await getAllBuckets(c.env.DB);
	const origin = new URL(c.req.url).origin;

	return jsonSuccess(c, {
		buckets: buckets.map((item) => ({
			id: item.id,
			bucket_name: item.bucket_name,
			preview_bucket_name: item.preview_bucket_name,
			is_default: item.is_default,
		})),
		current_bucket_id: bucket.id,
		current_folder: currentFolder,
		parent_folder: parentFolder,
		folders,
		files: files.map((item) => serializeFile(origin, item)),
	});
});

fileRoutes.post("/upload", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const formData = await c.req.formData();
	const file = formData.get("file");
	const requestedBucketId = parseInteger(String(formData.get("bucket_id") ?? ""));
	const bucket = requestedBucketId
		? await getBucketById(c.env.DB, requestedBucketId)
		: await getDefaultBucket(c.env.DB);

	if (!bucket || bucket.is_enabled !== 1) {
		return jsonError(c, 400, "A valid enabled bucket is required.");
	}

	if (!(file instanceof File)) {
		return jsonError(c, 400, "A file upload is required.");
	}

	const fileName = normalizeFileName(file.name);
	if (!fileName) {
		return jsonError(c, 400, "The uploaded file name is invalid.");
	}

	const folderPath = normalizeFolderPath(formData.get("folder_path"));
	const objectKey = buildObjectKey(folderPath, fileName);
	const storage = resolveBucketBinding(c.env, bucket.binding_name);
	if (!storage) {
		return jsonError(c, 500, "The configured bucket binding is not available.");
	}

	const existing = await storage.head(objectKey);
	if (existing) {
		return jsonError(
			c,
			409,
			"A file with the same name already exists in this folder.",
		);
	}

	const staleTracked = await getJoinedFileByLocation(
		c.env.DB,
		bucket.id,
		objectKey,
	);
	if (staleTracked) {
		await deleteTrackedFileRecord(c.env.DB, staleTracked.id);
	}

	const fileBuffer = await file.arrayBuffer();
	const checksum = await sha256Hex(fileBuffer);
	await storage.put(objectKey, fileBuffer, {
		httpMetadata: {
			contentType: file.type || "application/octet-stream",
		},
	});

	const now = unixTime();
	const isPublic = parseBooleanLike(formData.get("is_public"));
	const tracked = isPublic
		? await ensureTrackedFile(c.env.DB, {
				bucketId: bucket.id,
				objectKey,
				contentType: file.type || "application/octet-stream",
				size: file.size,
				etagOrChecksum: checksum,
				isPublic,
			})
		: null;

	const origin = new URL(c.req.url).origin;
	return jsonSuccess(
		c,
		{
			file: tracked
				? serializeTrackedFile(origin, bucket, tracked)
				: serializeFile(origin, {
						bucket,
						objectKey,
						folderPath,
						fileName,
						contentType: file.type || "application/octet-stream",
						size: file.size,
						etagOrChecksum: checksum,
						uploadedAt: now,
						tracked: null,
				  }),
		},
		201,
	);
});

fileRoutes.post("/:id/share", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const resolved = await resolveFileReference(c.env.DB, c.req.param("id"));
	if (!resolved) {
		return jsonError(c, 404, "File not found.");
	}

	let payload: { max_visits?: number | null; expires_at?: number | null } | null =
		null;
	try {
		payload = await c.req.json<{
			max_visits?: number | null;
			expires_at?: number | null;
		}>();
	} catch {
		return jsonError(c, 400, "Invalid share payload.");
	}

	const maxVisits = payload?.max_visits ?? null;
	const expiresAt = payload?.expires_at ?? null;
	if (maxVisits !== null && (!Number.isInteger(maxVisits) || maxVisits <= 0)) {
		return jsonError(c, 400, "Share max visits must be a positive integer.");
	}

	if (
		expiresAt !== null &&
		(!Number.isInteger(expiresAt) || expiresAt <= unixTime())
	) {
		return jsonError(c, 400, "Share expiration must be a future Unix timestamp.");
	}

	const storage = resolveBucketBinding(c.env, resolved.bucket.binding_name);
	if (!storage) {
		return jsonError(c, 500, "The configured bucket binding is not available.");
	}

	const object = await storage.head(resolved.objectKey);
	if (!object) {
		return jsonError(c, 404, "The source object could not be found in R2.");
	}

	const tracked =
		resolved.tracked ??
		(await ensureTrackedFile(c.env.DB, {
			bucketId: resolved.bucket.id,
			objectKey: resolved.objectKey,
			contentType: object.httpMetadata?.contentType ?? null,
			size: object.size,
			etagOrChecksum: object.etag ?? null,
			isPublic: false,
		}));

	const shareCode = await createUniqueShareCode(c.env.DB);
	const now = unixTime();
	await c.env.DB
		.prepare(
			"INSERT INTO file_shares (file_id, code, max_visits, visit_count, expires_at, is_active, created_at, updated_at, last_visited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(file_id) DO UPDATE SET code = excluded.code, max_visits = excluded.max_visits, visit_count = 0, expires_at = excluded.expires_at, is_active = 1, updated_at = excluded.updated_at, last_visited_at = NULL",
		)
		.bind(tracked.id, shareCode, maxVisits, 0, expiresAt, 1, now, now, null)
		.run();

	const updated = await getJoinedFile(c.env.DB, tracked.id);
	if (!updated) {
		return jsonError(c, 500, "Share could not be loaded.");
	}

	const origin = new URL(c.req.url).origin;
	return jsonSuccess(c, { file: serializeTrackedFile(origin, resolved.bucket, updated) });
});

fileRoutes.delete("/:id/share", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const resolved = await resolveFileReference(c.env.DB, c.req.param("id"));
	if (!resolved?.tracked) {
		return jsonError(c, 404, "File not found.");
	}

	const now = unixTime();
	await c.env.DB
		.prepare("UPDATE file_shares SET is_active = 0, updated_at = ? WHERE file_id = ?")
		.bind(now, resolved.tracked.id)
		.run();

	const updated = await getJoinedFile(c.env.DB, resolved.tracked.id);
	if (!updated) {
		return jsonError(c, 404, "File not found.");
	}

	const origin = new URL(c.req.url).origin;
	return jsonSuccess(c, { file: serializeTrackedFile(origin, resolved.bucket, updated) });
});

fileRoutes.get("/:id/download", async (c) => {
	const resolved = await resolveFileReference(c.env.DB, c.req.param("id"));
	if (!resolved) {
		return jsonError(c, 404, "File not found.");
	}

	const auth = c.get("auth");
	if ((!resolved.tracked || resolved.tracked.is_public !== 1) && !auth) {
		return jsonError(c, 401, "Authentication required.");
	}

	return streamResolvedFile(
		c.env,
		c.env.DB,
		resolved.bucket,
		resolved.objectKey,
		resolved.tracked,
	);
});

fileRoutes.patch("/:id", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const resolved = await resolveFileReference(c.env.DB, c.req.param("id"));
	if (!resolved) {
		return jsonError(c, 404, "File not found.");
	}

	let payload:
		| {
				file_name?: string;
				folder_path?: string;
				bucket_id?: number;
				is_public?: boolean | number | string;
		  }
		| null = null;
	try {
		payload = await c.req.json<{
			file_name?: string;
			folder_path?: string;
			bucket_id?: number;
			is_public?: boolean | number | string;
		}>();
	} catch {
		return jsonError(c, 400, "Invalid file update payload.");
	}

	const currentLocation = splitObjectKey(resolved.objectKey);
	const nextFileName =
		payload?.file_name !== undefined
			? normalizeFileName(payload.file_name)
			: resolved.tracked?.file_name || currentLocation.fileName;
	const nextFolderPath =
		payload?.folder_path !== undefined
			? normalizeFolderPath(payload.folder_path)
			: resolved.tracked?.folder_path || currentLocation.folderPath;
	const nextBucketId = payload?.bucket_id ?? resolved.bucket.id;
	const explicitPublicChange = payload?.is_public !== undefined;
	const nextPublic = explicitPublicChange
		? parseBooleanLike(payload?.is_public)
		: resolved.tracked?.is_public === 1;

	if (!nextFileName) {
		return jsonError(c, 400, "File name cannot be empty.");
	}

	const nextBucket = await getBucketById(c.env.DB, nextBucketId);
	if (!nextBucket || nextBucket.is_enabled !== 1) {
		return jsonError(c, 400, "Destination bucket is not available.");
	}

	const sourceBucket = resolveBucketBinding(c.env, resolved.bucket.binding_name);
	const destinationBucket = resolveBucketBinding(c.env, nextBucket.binding_name);
	if (!sourceBucket || !destinationBucket) {
		return jsonError(
			c,
			500,
			"A bucket binding is missing from the Worker environment.",
		);
	}

	const nextObjectKey = buildObjectKey(nextFolderPath, nextFileName);
	const locationChanged =
		nextBucket.id !== resolved.bucket.id || nextObjectKey !== resolved.objectKey;

	if (locationChanged) {
		const duplicateObject = await destinationBucket.head(nextObjectKey);
		if (duplicateObject) {
			return jsonError(
				c,
				409,
				"A file with the same name already exists in this folder.",
			);
		}

		const staleTracked = await getJoinedFileByLocation(
			c.env.DB,
			nextBucket.id,
			nextObjectKey,
		);
		if (staleTracked && staleTracked.id !== resolved.tracked?.id) {
			await deleteTrackedFileRecord(c.env.DB, staleTracked.id);
		}

		const object = await sourceBucket.get(resolved.objectKey);
		if (!object) {
			return jsonError(c, 404, "The source object could not be found in R2.");
		}

		await destinationBucket.put(nextObjectKey, object.body, {
			httpMetadata: {
				contentType:
					object.httpMetadata?.contentType ||
					resolved.tracked?.content_type ||
					"application/octet-stream",
			},
		});
		await sourceBucket.delete(resolved.objectKey);
	}

	const metadataStorage = locationChanged ? destinationBucket : sourceBucket;
	const metadata = await metadataStorage.head(nextObjectKey);
	if (!metadata) {
		return jsonError(c, 404, "The updated object could not be found in R2.");
	}

	const now = unixTime();
	let tracked = resolved.tracked;
	if (tracked) {
		await c.env.DB
			.prepare(
				`UPDATE files
				SET bucket_id = ?, object_key = ?, folder_path = ?, file_name = ?, content_type = ?, size = ?, etag_or_checksum = ?, is_public = ?, updated_at = ?, deleted_at = NULL
				WHERE id = ?`,
			)
			.bind(
				nextBucket.id,
				nextObjectKey,
				nextFolderPath,
				nextFileName,
				metadata.httpMetadata?.contentType ?? tracked.content_type,
				metadata.size,
				metadata.etag ?? tracked.etag_or_checksum,
				explicitPublicChange ? (nextPublic ? 1 : 0) : tracked.is_public,
				now,
				tracked.id,
			)
			.run();
		tracked = await getJoinedFile(c.env.DB, tracked.id);
	} else if (explicitPublicChange) {
		tracked = await ensureTrackedFile(c.env.DB, {
			bucketId: nextBucket.id,
			objectKey: nextObjectKey,
			contentType: metadata.httpMetadata?.contentType ?? null,
			size: metadata.size,
			etagOrChecksum: metadata.etag ?? null,
			isPublic: nextPublic,
		});
	}

	const origin = new URL(c.req.url).origin;
	return jsonSuccess(c, {
		file: tracked
			? serializeTrackedFile(origin, nextBucket, tracked)
			: serializeFile(origin, {
					bucket: nextBucket,
					objectKey: nextObjectKey,
					folderPath: nextFolderPath,
					fileName: nextFileName,
					contentType: metadata.httpMetadata?.contentType ?? null,
					size: metadata.size,
					etagOrChecksum: metadata.etag ?? null,
					uploadedAt: now,
					tracked: null,
			  }),
	});
});

fileRoutes.delete("/:id", async (c) => {
	const auth = requireAuth(c);
	if (auth instanceof Response) {
		return auth;
	}

	const resolved = await resolveFileReference(c.env.DB, c.req.param("id"));
	if (!resolved) {
		return jsonError(c, 404, "File not found.");
	}

	const bucket = resolveBucketBinding(c.env, resolved.bucket.binding_name);
	if (!bucket) {
		return jsonError(c, 500, "The configured bucket binding is not available.");
	}

	await bucket.delete(resolved.objectKey);
	if (resolved.tracked) {
		await deleteTrackedFileRecord(c.env.DB, resolved.tracked.id);
	}

	return jsonSuccess(c, { deleted: true, id: c.req.param("id") });
});

shareRoutes.get("/:code", async (c) => {
	const code = c.req.param("code");
	const share = await getShareByCode(c.env.DB, code);
	if (!share) {
		return jsonError(c, 404, "Share not found.");
	}

	const file = await getJoinedFile(c.env.DB, share.file_id);
	if (!file) {
		return jsonError(c, 404, "Shared file not found.");
	}

	const bucket = await getBucketById(c.env.DB, file.bucket_id);
	if (!bucket) {
		return jsonError(c, 404, "Bucket not found.");
	}

	if (share.is_active !== 1) {
		return jsonError(c, 410, "This short link is no longer active.");
	}

	const now = unixTime();
	if (share.expires_at && share.expires_at <= now) {
		await c.env.DB
			.prepare("UPDATE file_shares SET is_active = 0, updated_at = ? WHERE id = ?")
			.bind(now, share.id)
			.run();
		return jsonError(c, 410, "This short link has expired.");
	}

	if (share.max_visits && share.visit_count >= share.max_visits) {
		await c.env.DB
			.prepare("UPDATE file_shares SET is_active = 0, updated_at = ? WHERE id = ?")
			.bind(now, share.id)
			.run();
		return jsonError(c, 410, "This short link has reached its visit limit.");
	}

	await c.env.DB
		.prepare(
			"UPDATE file_shares SET visit_count = visit_count + 1, last_visited_at = ?, updated_at = ? WHERE id = ?",
		)
		.bind(now, now, share.id)
		.run();

	return streamResolvedFile(c.env, c.env.DB, bucket, file.object_key, file);
});

async function deleteTrackedFileRecord(
	db: D1Database,
	id: number,
): Promise<void> {
	await db.prepare("DELETE FROM file_shares WHERE file_id = ?").bind(id).run();
	await db.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
}
