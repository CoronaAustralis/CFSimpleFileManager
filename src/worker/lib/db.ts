import { configuredR2Buckets } from "../../shared/wrangler-config";

const SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS api_tokens (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		token_secret_encrypted TEXT,
		token_prefix TEXT NOT NULL,
		status INTEGER NOT NULL DEFAULT 1,
		last_used_at INTEGER,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS idx_api_tokens_status ON api_tokens(status)",
	"CREATE INDEX IF NOT EXISTS idx_api_tokens_last_used_at ON api_tokens(last_used_at)",
	`CREATE TABLE IF NOT EXISTS storage_buckets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		binding_name TEXT NOT NULL UNIQUE,
		bucket_name TEXT NOT NULL,
		preview_bucket_name TEXT,
		label TEXT NOT NULL,
		is_default INTEGER NOT NULL DEFAULT 0,
		is_enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS idx_storage_buckets_default ON storage_buckets(is_default)",
	"CREATE INDEX IF NOT EXISTS idx_storage_buckets_enabled ON storage_buckets(is_enabled)",
	`CREATE TABLE IF NOT EXISTS files (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		bucket_id INTEGER NOT NULL,
		object_key TEXT NOT NULL,
		folder_path TEXT NOT NULL DEFAULT '',
		file_name TEXT NOT NULL,
		content_type TEXT,
		size INTEGER NOT NULL,
		etag_or_checksum TEXT,
		is_public INTEGER NOT NULL DEFAULT 0,
		download_count INTEGER NOT NULL DEFAULT 0,
		last_download_at INTEGER,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER
	)`,
	"CREATE INDEX IF NOT EXISTS idx_files_bucket_folder ON files(bucket_id, folder_path)",
	"CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at)",
	"CREATE INDEX IF NOT EXISTS idx_files_name ON files(file_name)",
	`CREATE TABLE IF NOT EXISTS file_shares (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		file_id INTEGER NOT NULL UNIQUE,
		code TEXT NOT NULL UNIQUE,
		max_visits INTEGER,
		visit_count INTEGER NOT NULL DEFAULT 0,
		expires_at INTEGER,
		is_active INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		last_visited_at INTEGER
	)`,
	"CREATE INDEX IF NOT EXISTS idx_file_shares_code ON file_shares(code)",
	"CREATE INDEX IF NOT EXISTS idx_file_shares_active ON file_shares(is_active)",
] as const;

let bootstrapPromise: Promise<void> | null = null;

export interface StorageBucketRecord {
	id: number;
	binding_name: string;
	bucket_name: string;
	preview_bucket_name: string | null;
	label: string;
	is_default: number;
	is_enabled: number;
	created_at: number;
	updated_at: number;
}

export interface FileRecord {
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
}

export interface FileShareRecord {
	id: number;
	file_id: number;
	code: string;
	max_visits: number | null;
	visit_count: number;
	expires_at: number | null;
	is_active: number;
	created_at: number;
	updated_at: number;
	last_visited_at: number | null;
}

export async function ensureDatabase(db: D1Database): Promise<void> {
	if (!bootstrapPromise) {
		bootstrapPromise = (async () => {
			await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
			await ensureApiTokenColumns(db);
			await ensureStorageBucketColumns(db);
			await syncConfiguredBuckets(db);
		})().catch((error) => {
			bootstrapPromise = null;
			throw error;
		});
	}

	await bootstrapPromise;
}

export async function getAllBuckets(db: D1Database): Promise<StorageBucketRecord[]> {
	const result = await db
		.prepare(
			"SELECT id, binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at FROM storage_buckets WHERE is_enabled = 1 ORDER BY is_default DESC, id ASC",
		)
		.all<StorageBucketRecord>();
	return result.results;
}

export async function getBucketById(
	db: D1Database,
	id: number,
): Promise<StorageBucketRecord | null> {
	return (
		(await db
			.prepare(
				"SELECT id, binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at FROM storage_buckets WHERE id = ? AND is_enabled = 1 LIMIT 1",
			)
			.bind(id)
			.first<StorageBucketRecord>()) ?? null
	);
}

export async function getBucketByName(
	db: D1Database,
	bucketName: string,
): Promise<StorageBucketRecord | null> {
	return (
		(await db
			.prepare(
				"SELECT id, binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at FROM storage_buckets WHERE bucket_name = ? ORDER BY is_enabled DESC, id DESC LIMIT 1",
			)
			.bind(bucketName)
			.first<StorageBucketRecord>()) ?? null
	);
}

export async function getBucketByBindingName(
	db: D1Database,
	bindingName: string,
): Promise<StorageBucketRecord | null> {
	return (
		(await db
			.prepare(
				"SELECT id, binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at FROM storage_buckets WHERE binding_name = ? ORDER BY is_enabled DESC, id DESC LIMIT 1",
			)
			.bind(bindingName)
			.first<StorageBucketRecord>()) ?? null
	);
}

export async function getDefaultBucket(
	db: D1Database,
): Promise<StorageBucketRecord | null> {
	return (
		(await db
			.prepare(
				"SELECT id, binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at FROM storage_buckets WHERE is_default = 1 AND is_enabled = 1 LIMIT 1",
			)
			.first<StorageBucketRecord>()) ?? null
	);
}

export async function getActiveFileById(
	db: D1Database,
	id: number,
): Promise<FileRecord | null> {
	return (
		(await db
			.prepare(
				"SELECT id, bucket_id, object_key, folder_path, file_name, content_type, size, etag_or_checksum, is_public, download_count, last_download_at, created_at, updated_at, deleted_at FROM files WHERE id = ? AND deleted_at IS NULL LIMIT 1",
			)
			.bind(id)
			.first<FileRecord>()) ?? null
	);
}

export function unixTime(): number {
	return Math.floor(Date.now() / 1000);
}

async function ensureApiTokenColumns(db: D1Database): Promise<void> {
	try {
		await db
			.prepare("SELECT token_secret_encrypted FROM api_tokens LIMIT 1")
			.first();
	} catch {
		await db
			.prepare("ALTER TABLE api_tokens ADD COLUMN token_secret_encrypted TEXT")
			.run();
	}
}

async function ensureStorageBucketColumns(db: D1Database): Promise<void> {
	try {
		await db
			.prepare("SELECT preview_bucket_name FROM storage_buckets LIMIT 1")
			.first();
	} catch {
		await db
			.prepare("ALTER TABLE storage_buckets ADD COLUMN preview_bucket_name TEXT")
			.run();
	}
}

async function syncConfiguredBuckets(db: D1Database): Promise<void> {
	if (configuredR2Buckets.length === 0) {
		return;
	}

	const existingCount = await db
		.prepare("SELECT COUNT(*) AS count FROM storage_buckets")
		.first<{ count: number }>();
	if (Number(existingCount?.count ?? 0) > 0) {
		return;
	}

	const now = unixTime();
	for (const bucket of configuredR2Buckets) {
		await db
			.prepare(
				"INSERT INTO storage_buckets (binding_name, bucket_name, preview_bucket_name, label, is_default, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				bucket.binding,
				bucket.bucket_name,
				bucket.preview_bucket_name,
				bucket.bucket_name,
				bucket.is_default ? 1 : 0,
				1,
				now,
				now,
			)
			.run();
	}
}
