export class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

interface ApiEnvelope<T> {
	ok: boolean;
	data?: T;
	error?: {
		message?: string;
	};
}

export interface AuthSession {
	username: string;
	auth_method: "session" | "token";
	expires_at: number | null;
}

export interface BucketRecord {
	id: number;
	bucket_name: string;
	preview_bucket_name: string | null;
	is_default: number;
}

export interface BucketListData {
	buckets: BucketRecord[];
}

export interface FolderItem {
	name: string;
	path: string;
	file_count: number;
}

export interface FileShareInfo {
	id: number;
	code: string;
	max_visits: number | null;
	visit_count: number;
	expires_at: number | null;
	is_active: boolean;
	last_visited_at: number | null;
	url: string;
}

export interface ManagedFile {
	id: string;
	bucket_id: number;
	bucket_label: string;
	object_key: string;
	folder_path: string;
	file_name: string;
	content_type: string | null;
	size: number;
	etag_or_checksum: string | null;
	is_public: boolean;
	download_count: number;
	last_download_at: number | null;
	created_at: number;
	updated_at: number;
	download_url: string;
	preview_url: string;
	share: FileShareInfo | null;
}

export interface FileBrowserData {
	buckets: BucketRecord[];
	current_bucket_id: number;
	current_folder: string;
	parent_folder: string | null;
	folders: FolderItem[];
	files: ManagedFile[];
}

export interface TokenListItem {
	id: number;
	name: string;
	token_prefix: string;
	is_active: boolean;
	last_used_at: number | null;
	created_at: number;
	updated_at: number;
}

export interface TokenListData {
	tokens: TokenListItem[];
}

export interface TokenSecretData {
	id: number;
	name: string;
	token: string;
	token_prefix: string;
}

async function request<T>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	const isFormData = init.body instanceof FormData;
	if (!isFormData && init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const response = await fetch(path, {
		credentials: "include",
		...init,
		headers,
	});

	const text = await response.text();
	const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;

	if (!response.ok || !payload?.ok || payload.data === undefined) {
		const message =
			payload?.error?.message || response.statusText || "Request failed";
		throw new ApiError(message, response.status);
	}

	return payload.data;
}

async function uploadRequest<T>(
	path: string,
	formData: FormData,
	onProgress?: (progress: number) => void,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", path);
		xhr.withCredentials = true;
		xhr.setRequestHeader("Accept", "application/json");

		xhr.upload.onprogress = (event) => {
			if (!onProgress) {
				return;
			}

			if (event.lengthComputable && event.total > 0) {
				onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
			}
		};

		xhr.onerror = () => {
			reject(new ApiError("Network error.", xhr.status || 0));
		};

		xhr.onload = () => {
			const text = xhr.responseText;
			const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;

			if (xhr.status < 200 || xhr.status >= 300 || !payload?.ok || payload.data === undefined) {
				const message =
					payload?.error?.message || xhr.statusText || "Request failed";
				reject(new ApiError(message, xhr.status));
				return;
			}

			onProgress?.(100);
			resolve(payload.data);
		};

		xhr.send(formData);
	});
}

export const authApi = {
	login: (password: string) =>
		request<AuthSession>("/api/auth/login", {
			method: "POST",
			body: JSON.stringify({ password }),
		}),
	logout: () =>
		request<{ logged_out: boolean }>("/api/auth/logout", {
			method: "POST",
		}),
	me: () => request<AuthSession>("/api/auth/me"),
};

export const bucketApi = {
	list: () => request<BucketListData>("/api/buckets"),
	create: (payload: {
		binding_name: string;
		bucket_name: string;
		preview_bucket_name?: string | null;
	}) =>
		request<{ bucket: BucketRecord }>("/api/buckets", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	remove: (id: number) =>
		request<{ deleted: boolean; id: number }>(`/api/buckets/${id}`, {
			method: "DELETE",
		}),
};

export const fileApi = {
	list: (params: {
		bucket_id?: number;
		folder_path?: string;
	}) => {
		const query = new URLSearchParams();
		if (params.bucket_id) {
			query.set("bucket_id", String(params.bucket_id));
		}
		if (params.folder_path) {
			query.set("folder_path", params.folder_path);
		}

		const suffix = query.size > 0 ? `?${query.toString()}` : "";
		return request<FileBrowserData>(`/api/files${suffix}`);
	},
	upload: (payload: {
		file: File;
		folder_path?: string;
		bucket_id?: number;
		is_public?: boolean;
		onProgress?: (progress: number) => void;
	}) => {
		const formData = new FormData();
		formData.append("file", payload.file);
		if (payload.folder_path) {
			formData.append("folder_path", payload.folder_path);
		}
		if (payload.bucket_id) {
			formData.append("bucket_id", String(payload.bucket_id));
		}
		formData.append("is_public", payload.is_public ? "1" : "0");

		return uploadRequest<{ file: ManagedFile }>(
			"/api/files/upload",
			formData,
			payload.onProgress,
		);
	},
	update: (
		id: string,
		payload: {
			file_name?: string;
			folder_path?: string;
			bucket_id?: number;
			is_public?: boolean;
		},
	) =>
		request<{ file: ManagedFile }>(`/api/files/${id}`, {
			method: "PATCH",
			body: JSON.stringify(payload),
		}),
	remove: (id: string) =>
		request<{ deleted: boolean; id: string }>(`/api/files/${id}`, {
			method: "DELETE",
		}),
	share: (
		id: string,
		payload: { max_visits?: number | null; expires_at?: number | null },
	) =>
		request<{ file: ManagedFile }>(`/api/files/${id}/share`, {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	disableShare: (id: string) =>
		request<{ file: ManagedFile }>(`/api/files/${id}/share`, {
			method: "DELETE",
		}),
};

export const tokenApi = {
	list: () => request<TokenListData>("/api/tokens"),
	create: (name: string) =>
		request<TokenSecretData>("/api/tokens", {
			method: "POST",
			body: JSON.stringify({ name }),
		}),
	rotate: (id: number) =>
		request<TokenSecretData>(`/api/tokens/${id}/rotate`, {
			method: "POST",
		}),
	reveal: (id: number) => request<TokenSecretData>(`/api/tokens/${id}/secret`),
	disable: (id: number) =>
		request<{ id: number; disabled: boolean }>(`/api/tokens/${id}`, {
			method: "DELETE",
		}),
};
