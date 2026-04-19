declare const __WEB_LOCATION__: string;
/// <reference types="vite/client" />

interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	FILES_DEFAULT: R2Bucket;
	ADMIN_PASSWORD: string;
	AUTH_SECRET?: string;
	[key: string]: unknown;
}
