import { FileShareRecord, StorageBucketRecord, getBucketById, unixTime } from "./db";
import { formatAttachmentHeader, parentFolderPath } from "./http";
import { randomCode, resolveBucketBinding } from "./storage";

const JOINED_FILE_SELECT = `SELECT
	f.id,
	f.bucket_id,
	f.object_key,
	f.folder_path,
	f.file_name,
	f.content_type,
	f.size,
	f.etag_or_checksum,
	f.is_public,
	f.download_count,
	f.last_download_at,
	f.created_at,
	f.updated_at,
	f.deleted_at,
	b.bucket_name AS bucket_label,
	b.binding_name AS binding_name,
	s.id AS share_id,
	s.code AS share_code,
	s.max_visits AS share_max_visits,
	s.visit_count AS share_visit_count,
	s.expires_at AS share_expires_at,
	s.is_active AS share_is_active,
	s.last_visited_at AS share_last_visited_at
FROM files f
JOIN storage_buckets b ON b.id = f.bucket_id
LEFT JOIN file_shares s ON s.file_id = f.id`;

const LOOKUP_CHUNK_SIZE = 64;

export interface FileRow {
	id: number;
	bucket_id: number;
	object_key: string;
	folder_path: string;
	file_name: string;
	content_type: string | null;
	size: number;
	etag_or_checksum: string | null;
	is_public: number;
	download_count: number;
	last_download_at: number | null;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	bucket_label: string;
	binding_name: string;
	share_id: number | null;
	share_code: string | null;
	share_max_visits: number | null;
	share_visit_count: number | null;
	share_expires_at: number | null;
	share_is_active: number | null;
	share_last_visited_at: number | null;
}

export interface FolderItem {
	name: string;
	path: string;
	file_count: number;
}

export interface FileReference {
	bucketId: number;
	objectKey: string;
}

export interface ListedFileSource {
	bucket: StorageBucketRecord;
	objectKey: string;
	folderPath: string;
	fileName: string;
	contentType: string | null;
	size: number;
	etagOrChecksum: string | null;
	uploadedAt: number | null;
	tracked: FileRow | null;
}

export interface ResolvedFileReference {
	bucket: StorageBucketRecord;
	objectKey: string;
	tracked: FileRow | null;
}

export async function listFiles(
	env: Env,
	db: D1Database,
	bucket: StorageBucketRecord,
	currentFolder: string,
): Promise<{
	files: ListedFileSource[];
	folders: FolderItem[];
	parentFolder: string | null;
}> {
	const storage = resolveBucketBinding(env, bucket.binding_name);
	if (!storage) {
		throw new Error("The configured bucket binding is not available.");
	}

	const prefix = currentFolder ? `${currentFolder}/` : "";
	const listing = await storage.list({
		prefix,
		delimiter: "/",
		limit: 200,
	});
	const objectKeys = listing.objects.map((object) => object.key);
	const trackedByKey = await getTrackedFilesByObjectKeys(db, bucket.id, objectKeys);

	return {
		files: listing.objects.map((object) => {
			const location = splitObjectKey(object.key);
			return {
				bucket,
				objectKey: object.key,
				folderPath: location.folderPath,
				fileName: location.fileName,
				contentType: null,
				size: object.size,
				etagOrChecksum: object.etag ?? null,
				uploadedAt: toUnixTimestamp(object.uploaded),
				tracked: trackedByKey.get(object.key) ?? null,
			};
		}),
		folders: (listing.delimitedPrefixes ?? [])
			.map((folderPrefix) => {
				const path = folderPrefix.endsWith("/")
					? folderPrefix.slice(0, -1)
					: folderPrefix;
				const parts = path.split("/");
				return {
					name: parts[parts.length - 1] ?? path,
					path,
					file_count: 0,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name)),
		parentFolder: parentFolderPath(currentFolder),
	};
}

export async function getJoinedFile(
	db: D1Database,
	id: number,
): Promise<FileRow | null> {
	return (
		(await db
			.prepare(
				`${JOINED_FILE_SELECT}
				WHERE f.deleted_at IS NULL AND f.id = ?
				LIMIT 1`,
			)
			.bind(id)
			.first<FileRow>()) ?? null
	);
}

export async function getJoinedFileByLocation(
	db: D1Database,
	bucketId: number,
	objectKey: string,
): Promise<FileRow | null> {
	return (
		(await db
			.prepare(
				`${JOINED_FILE_SELECT}
				WHERE f.deleted_at IS NULL AND f.bucket_id = ? AND f.object_key = ?
				LIMIT 1`,
			)
			.bind(bucketId, objectKey)
			.first<FileRow>()) ?? null
	);
}

export async function ensureTrackedFile(
	db: D1Database,
	payload: {
		bucketId: number;
		objectKey: string;
		contentType: string | null;
		size: number;
		etagOrChecksum: string | null;
		isPublic?: boolean;
	},
): Promise<FileRow> {
	const existing = await getJoinedFileByLocation(
		db,
		payload.bucketId,
		payload.objectKey,
	);
	const location = splitObjectKey(payload.objectKey);
	const now = unixTime();

	if (existing) {
		await db
			.prepare(
				`UPDATE files
				SET folder_path = ?, file_name = ?, content_type = ?, size = ?, etag_or_checksum = ?, is_public = ?, updated_at = ?, deleted_at = NULL
				WHERE id = ?`,
			)
			.bind(
				location.folderPath,
				location.fileName,
				payload.contentType,
				payload.size,
				payload.etagOrChecksum,
				payload.isPublic === undefined ? existing.is_public : payload.isPublic ? 1 : 0,
				now,
				existing.id,
			)
			.run();
	} else {
		await db
			.prepare(
				`INSERT INTO files (
					bucket_id,
					object_key,
					folder_path,
					file_name,
					content_type,
					size,
					etag_or_checksum,
					is_public,
					download_count,
					last_download_at,
					created_at,
					updated_at,
					deleted_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				payload.bucketId,
				payload.objectKey,
				location.folderPath,
				location.fileName,
				payload.contentType,
				payload.size,
				payload.etagOrChecksum,
				payload.isPublic ? 1 : 0,
				0,
				null,
				now,
				now,
				null,
			)
			.run();
	}

	const tracked = await getJoinedFileByLocation(db, payload.bucketId, payload.objectKey);
	if (!tracked) {
		throw new Error("Tracked file could not be loaded.");
	}

	return tracked;
}

export async function resolveFileReference(
	db: D1Database,
	value: string,
): Promise<ResolvedFileReference | null> {
	if (/^\d+$/.test(value)) {
		const tracked = await getJoinedFile(db, Number.parseInt(value, 10));
		if (tracked) {
			const bucket = await getBucketById(db, tracked.bucket_id);
			if (!bucket) {
				return null;
			}

			return {
				bucket,
				objectKey: tracked.object_key,
				tracked,
			};
		}
	}

	const decoded = decodeFileRef(value);
	if (!decoded) {
		return null;
	}

	const bucket = await getBucketById(db, decoded.bucketId);
	if (!bucket) {
		return null;
	}

	return {
		bucket,
		objectKey: decoded.objectKey,
		tracked: await getJoinedFileByLocation(
			db,
			decoded.bucketId,
			decoded.objectKey,
		),
	};
}

export function encodeFileRef(bucketId: number, objectKey: string): string {
	return base64UrlEncode(JSON.stringify([bucketId, objectKey]));
}

export function decodeFileRef(value: string): FileReference | null {
	try {
		const parsed = JSON.parse(base64UrlDecode(value)) as unknown;
		if (!Array.isArray(parsed) || parsed.length !== 2) {
			return null;
		}

		const [bucketId, objectKey] = parsed;
		if (!Number.isInteger(bucketId) || typeof objectKey !== "string" || !objectKey) {
			return null;
		}

		return {
			bucketId,
			objectKey,
		};
	} catch {
		return null;
	}
}

export function splitObjectKey(objectKey: string): {
	folderPath: string;
	fileName: string;
} {
	const parts = objectKey.split("/");
	const fileName = parts.pop() ?? "";
	return {
		folderPath: parts.join("/"),
		fileName,
	};
}

export function serializeFile(origin: string, source: ListedFileSource) {
	const shareEnabled =
		source.tracked?.share_id !== null &&
		source.tracked?.share_is_active === 1 &&
		source.tracked?.share_code;
	const fileRef = encodeFileRef(source.bucket.id, source.objectKey);

	return {
		id: fileRef,
		bucket_id: source.bucket.id,
		bucket_label: source.bucket.bucket_name,
		object_key: source.objectKey,
		folder_path: source.folderPath,
		file_name: source.fileName,
		content_type: source.tracked?.content_type ?? source.contentType,
		size: source.tracked?.size ?? source.size,
		etag_or_checksum:
			source.tracked?.etag_or_checksum ?? source.etagOrChecksum,
		is_public: source.tracked?.is_public === 1,
		download_count: source.tracked?.download_count ?? 0,
		last_download_at: source.tracked?.last_download_at ?? null,
		created_at: source.tracked?.created_at ?? source.uploadedAt ?? 0,
		updated_at: source.tracked?.updated_at ?? source.uploadedAt ?? 0,
		download_url: `${origin}/api/files/${fileRef}/download`,
		preview_url: `${origin}/api/files/${fileRef}/preview`,
		share: shareEnabled
			? {
					id: source.tracked!.share_id,
					code: source.tracked!.share_code,
					max_visits: source.tracked!.share_max_visits,
					visit_count: source.tracked!.share_visit_count ?? 0,
					expires_at: source.tracked!.share_expires_at,
					is_active: source.tracked!.share_is_active === 1,
					last_visited_at: source.tracked!.share_last_visited_at,
					url: `${origin}/s/${source.tracked!.share_code}`,
			  }
			: null,
	};
}

export function serializeTrackedFile(
	origin: string,
	bucket: StorageBucketRecord,
	row: FileRow,
) {
	return serializeFile(origin, {
		bucket,
		objectKey: row.object_key,
		folderPath: row.folder_path,
		fileName: row.file_name,
		contentType: row.content_type,
		size: row.size,
		etagOrChecksum: row.etag_or_checksum,
		uploadedAt: row.updated_at,
		tracked: row,
	});
}

export async function createUniqueShareCode(db: D1Database): Promise<string> {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const code = randomCode(9);
		const existing = await db
			.prepare("SELECT id FROM file_shares WHERE code = ? LIMIT 1")
			.bind(code)
			.first<{ id: number }>();
		if (!existing) {
			return code;
		}
	}

	throw new Error("Could not create a unique share code.");
}

export async function getShareByCode(
	db: D1Database,
	code: string,
): Promise<FileShareRecord | null> {
	return (
		(await db
			.prepare(
				`SELECT
					id,
					file_id,
					code,
					max_visits,
					visit_count,
					expires_at,
					is_active,
					created_at,
					updated_at,
					last_visited_at
				FROM file_shares
				WHERE code = ?
				LIMIT 1`,
			)
			.bind(code)
			.first<FileShareRecord>()) ?? null
	);
}

export async function streamResolvedFile(
	env: Env,
	db: D1Database,
	bucket: StorageBucketRecord,
	objectKey: string,
	tracked: FileRow | null,
	options?: {
		disposition?: "attachment" | "inline";
		trackDownload?: boolean;
	},
): Promise<Response> {
	const storage = resolveBucketBinding(env, bucket.binding_name);
	if (!storage) {
		return Response.json(
			{
				ok: false,
				error: { message: "Bucket binding is missing." },
			},
			{ status: 500 },
		);
	}

	const object = await storage.get(objectKey);
	if (!object) {
		return Response.json(
			{
				ok: false,
				error: { message: "Stored object not found." },
			},
			{ status: 404 },
		);
	}

	const disposition = options?.disposition ?? "attachment";
	const trackDownload = options?.trackDownload ?? disposition === "attachment";

	if (tracked && trackDownload) {
		const now = unixTime();
		await db
			.prepare(
				"UPDATE files SET download_count = download_count + 1, last_download_at = ?, updated_at = ? WHERE id = ?",
			)
			.bind(now, now, tracked.id)
			.run();
	}

	const location = splitObjectKey(objectKey);
	const headers = new Headers();
	headers.set(
		"Content-Type",
		tracked?.content_type ||
			object.httpMetadata?.contentType ||
			"application/octet-stream",
	);
	headers.set(
		"Content-Disposition",
		disposition === "attachment"
			? formatAttachmentHeader(tracked?.file_name || location.fileName)
			: `inline; filename*=UTF-8''${encodeURIComponent(
					tracked?.file_name || location.fileName,
			  )}`,
	);
	headers.set(
		"Cache-Control",
		tracked?.is_public === 1
			? "public, max-age=0, must-revalidate"
			: "private, max-age=0, must-revalidate",
	);
	headers.set("Content-Length", String(tracked?.size ?? object.size));

	return new Response(object.body, {
		status: 200,
		headers,
	});
}

async function getTrackedFilesByObjectKeys(
	db: D1Database,
	bucketId: number,
	objectKeys: string[],
): Promise<Map<string, FileRow>> {
	const result = new Map<string, FileRow>();
	if (objectKeys.length === 0) {
		return result;
	}

	for (let index = 0; index < objectKeys.length; index += LOOKUP_CHUNK_SIZE) {
		const chunk = objectKeys.slice(index, index + LOOKUP_CHUNK_SIZE);
		const placeholders = chunk.map(() => "?").join(", ");
		const rows = await db
			.prepare(
				`${JOINED_FILE_SELECT}
				WHERE f.deleted_at IS NULL
				  AND f.bucket_id = ?
				  AND f.object_key IN (${placeholders})`,
			)
			.bind(bucketId, ...chunk)
			.all<FileRow>();

		for (const row of rows.results) {
			result.set(row.object_key, row);
		}
	}

	return result;
}

function base64UrlEncode(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
	const binary = atob(`${normalized}${padding}`);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function toUnixTimestamp(value: Date | string | null | undefined): number | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return Math.floor(value.getTime() / 1000);
	}

	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}
