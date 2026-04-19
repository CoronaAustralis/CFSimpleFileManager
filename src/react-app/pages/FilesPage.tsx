import { useEffect, useEffectEvent, useState } from "react";
import { DialogShell } from "../components/DialogShell";
import { Notice, type NoticeState } from "../components/Notice";
import {
	fileApi,
	type FileBrowserData,
	type ManagedFile,
} from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
	copyText,
	formatBytes,
	formatTimestamp,
	toDateTimeLocal,
	toUnixTimestamp,
} from "../lib/utils";

export function FilesPage() {
	const { locale, t } = useI18n();
	const [browser, setBrowser] = useState<FileBrowserData | null>(null);
	const [selectedBucketId, setSelectedBucketId] = useState<number | undefined>();
	const [currentFolder, setCurrentFolder] = useState("");
	const [loading, setLoading] = useState(true);
	const [notice, setNotice] = useState<NoticeState | null>(null);

	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadFolder, setUploadFolder] = useState("");
	const [uploadBucketId, setUploadBucketId] = useState<number | undefined>();
	const [uploadIsPublic, setUploadIsPublic] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

	const [editingFile, setEditingFile] = useState<ManagedFile | null>(null);
	const [editFileName, setEditFileName] = useState("");
	const [editFolderPath, setEditFolderPath] = useState("");
	const [editBucketId, setEditBucketId] = useState<number | undefined>();
	const [editIsPublic, setEditIsPublic] = useState(false);

	const [shareFile, setShareFile] = useState<ManagedFile | null>(null);
	const [shareMaxVisits, setShareMaxVisits] = useState("");
	const [shareExpiresAt, setShareExpiresAt] = useState("");
	const [previewFile, setPreviewFile] = useState<ManagedFile | null>(null);
	const [previewState, setPreviewState] = useState<FilePreviewState>({
		kind: "idle",
	});

	const loadFiles = async (overrides?: {
		bucketId?: number;
		folder?: string;
	}) => {
		setLoading(true);
		try {
			const data = await fileApi.list({
				bucket_id: overrides?.bucketId ?? selectedBucketId,
				folder_path: overrides?.folder ?? currentFolder,
			});
			setBrowser(data);
			setSelectedBucketId(data.current_bucket_id);
			setUploadBucketId((previous) => previous ?? data.current_bucket_id);
			if (!editingFile) {
				setCurrentFolder(data.current_folder);
			}
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to load files.",
			});
		} finally {
			setLoading(false);
		}
	};

	const loadFilesEvent = useEffectEvent(loadFiles);

	useEffect(() => {
		void loadFilesEvent();
	}, []);

	const dialogOpen =
		isUploadDialogOpen ||
		editingFile !== null ||
		shareFile !== null ||
		previewFile !== null;

	useEffect(() => {
		if (!dialogOpen) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [dialogOpen]);

	const activeBuckets = browser?.buckets ?? [];
	const handleCopy = (value: string) => {
		void copyText(value).then(() =>
			setNotice({
				type: "success",
				message: t("notice_copied"),
			}),
		);
	};

	const openUploadDialog = () => {
		setUploadFile(null);
		setUploadFolder(currentFolder);
		setUploadBucketId(selectedBucketId ?? browser?.current_bucket_id);
		setUploadIsPublic(false);
		setUploadProgress(0);
		setIsUploadDialogOpen(true);
	};

	const closeUploadDialog = () => {
		if (uploading) {
			return;
		}

		setIsUploadDialogOpen(false);
		setUploadFile(null);
		setUploadFolder(currentFolder);
		setUploadBucketId(selectedBucketId ?? browser?.current_bucket_id);
		setUploadIsPublic(false);
		setUploadProgress(0);
	};

	const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!uploadFile || uploading) {
			return;
		}

		try {
			setUploading(true);
			setUploadProgress(0);
			setNotice(null);
			await fileApi.upload({
				file: uploadFile,
				bucket_id: uploadBucketId,
				folder_path: uploadFolder,
				is_public: uploadIsPublic,
				onProgress: (progress) => setUploadProgress(progress),
			});
			setUploadProgress(100);
			setIsUploadDialogOpen(false);
			setUploadFile(null);
			setUploadFolder(currentFolder);
			setUploadBucketId(selectedBucketId ?? browser?.current_bucket_id);
			setUploadIsPublic(false);
			setNotice({ type: "success", message: t("notice_uploaded") });
			await loadFiles({ bucketId: uploadBucketId, folder: currentFolder });
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Upload failed.",
			});
			setUploadProgress(0);
		} finally {
			setUploading(false);
		}
	};

	const openEdit = (file: ManagedFile) => {
		setEditingFile(file);
		setEditFileName(file.file_name);
		setEditFolderPath(file.folder_path);
		setEditBucketId(file.bucket_id);
		setEditIsPublic(file.is_public);
	};

	const openShare = (file: ManagedFile) => {
		setShareFile(file);
		setShareMaxVisits(file.share?.max_visits ? String(file.share.max_visits) : "");
		setShareExpiresAt(toDateTimeLocal(file.share?.expires_at ?? null));
	};

	const openPreview = (file: ManagedFile) => {
		setPreviewState({ kind: "loading" });
		setPreviewFile(file);
	};

	useEffect(() => {
		if (!previewFile) {
			setPreviewState({ kind: "idle" });
			return;
		}

		const previewKind = getPreviewKind(previewFile);
		if (previewKind === "unsupported") {
			setPreviewState({ kind: "unsupported" });
			return;
		}

		const controller = new AbortController();
		let objectUrl: string | null = null;

		void (async () => {
			try {
				const response = await fetch(previewFile.preview_url, {
					credentials: "include",
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(await extractResponseMessage(response));
				}

				if (previewKind === "text") {
					const text = await response.text();
					if (!controller.signal.aborted) {
						setPreviewState({ kind: "text", text });
					}
					return;
				}

				const blob = await response.blob();
				if (controller.signal.aborted) {
					return;
				}

				objectUrl = URL.createObjectURL(blob);
				setPreviewState({ kind: previewKind, objectUrl });
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				setPreviewState({
					kind: "error",
					message:
						error instanceof Error ? error.message : "Failed to load preview.",
				});
			}
		})();

		return () => {
			controller.abort();
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [previewFile]);

	const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!editingFile) {
			return;
		}

		try {
			const payload: {
				file_name?: string;
				folder_path?: string;
				bucket_id?: number;
				is_public?: boolean;
			} = {};

			if (editFileName !== editingFile.file_name) {
				payload.file_name = editFileName;
			}
			if (editFolderPath !== editingFile.folder_path) {
				payload.folder_path = editFolderPath;
			}
			if (editBucketId !== editingFile.bucket_id) {
				payload.bucket_id = editBucketId;
			}
			if (editIsPublic !== editingFile.is_public) {
				payload.is_public = editIsPublic;
			}

			await fileApi.update(editingFile.id, payload);
			setEditingFile(null);
			setNotice({ type: "success", message: t("notice_saved") });
			await loadFiles();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to update file.",
			});
		}
	};

	const handleShareSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!shareFile) {
			return;
		}

		try {
			const result = await fileApi.share(shareFile.id, {
				max_visits: shareMaxVisits ? Number.parseInt(shareMaxVisits, 10) : null,
				expires_at: toUnixTimestamp(shareExpiresAt),
			});
			setShareFile(result.file);
			setNotice({ type: "success", message: t("notice_saved") });
			await loadFiles();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to update short link.",
			});
		}
	};

	const handleDisableShare = async () => {
		if (!shareFile) {
			return;
		}

		try {
			await fileApi.disableShare(shareFile.id);
			setNotice({ type: "success", message: t("notice_share_disabled") });
			setShareFile(null);
			await loadFiles();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to disable short link.",
			});
		}
	};

	const handleDelete = async (file: ManagedFile) => {
		if (!window.confirm(t("confirm_delete_file"))) {
			return;
		}

		try {
			await fileApi.remove(file.id);
			setNotice({ type: "success", message: t("notice_deleted") });
			if (editingFile?.id === file.id) {
				setEditingFile(null);
			}
			if (shareFile?.id === file.id) {
				setShareFile(null);
			}
			if (previewFile?.id === file.id) {
				setPreviewFile(null);
			}
			await loadFiles();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to delete file.",
			});
		}
	};

	const breadcrumbs = buildBreadcrumbs(currentFolder, t("root"));
	const totalFiles = browser?.files.length ?? 0;
	const totalFolders = browser?.folders.length ?? 0;
	const currentBucketName =
		activeBuckets.find(
			(bucket) => bucket.id === (selectedBucketId ?? browser?.current_bucket_id),
		)?.bucket_name ?? "—";

	return (
		<div className="space-y-6">
			<section className="panel-card overflow-hidden p-0">
				<div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(9,14,27,0.74))] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
					<div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,640px)] xl:items-start">
						<div className="max-w-2xl space-y-2">
							<h2 className="section-title">{t("files_title")}</h2>
							<p className="section-subtitle max-w-2xl">
								{t("files_subtitle")}
							</p>
						</div>

						<div className="space-y-4 xl:justify-self-end xl:w-full xl:max-w-[640px]">
							<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
								<label className="space-y-2">
									<span className="field-label">{t("bucket")}</span>
									<select
										className="field-input h-[58px]"
										value={selectedBucketId ?? ""}
										onChange={(event) => {
											const nextBucketId = Number.parseInt(event.target.value, 10);
											setSelectedBucketId(nextBucketId);
											setUploadBucketId(nextBucketId);
											setCurrentFolder("");
											void loadFiles({
												bucketId: nextBucketId,
												folder: "",
											});
										}}
									>
										{activeBuckets.map((bucket) => (
											<option key={bucket.id} value={bucket.id}>
												{bucket.bucket_name}
											</option>
										))}
									</select>
								</label>

								<div className="space-y-2">
									<span className="field-label opacity-0">{t("upload_title")}</span>
									<button
										type="button"
										className="primary-button h-[58px] w-full rounded-[20px]"
										onClick={openUploadDialog}
									>
										{t("upload_title")}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<Notice notice={notice} />

			<div className="space-y-6">
				<section className="panel-card space-y-5">
					<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="field-label">{t("current_folder")}</span>
								{breadcrumbs.map((item) => (
									<button
										key={item.path}
										type="button"
										className={`rounded-full border px-3 py-1.5 text-sm transition ${
											item.path === currentFolder
												? "border-cyan-300/30 bg-cyan-300/12 text-cyan-50"
												: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
										}`}
										onClick={() => {
											setCurrentFolder(item.path);
											void loadFiles({
												bucketId: selectedBucketId,
												folder: item.path,
											});
										}}
									>
										{item.label}
									</button>
								))}
							</div>

							<div className="flex flex-wrap gap-2">
								<MetaPill label={t("bucket")} value={currentBucketName} />
							</div>
						</div>
					</div>

					{totalFolders ? (
						<div className="flex flex-wrap gap-3">
							{browser?.folders.map((folder) => (
								<button
									key={folder.path}
									type="button"
									className="group min-w-[220px] flex-1 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/[0.07] sm:max-w-[280px]"
									onClick={() => {
										setCurrentFolder(folder.path);
										void loadFiles({
											bucketId: selectedBucketId,
											folder: folder.path,
										});
									}}
								>
									<p className="text-[11px] uppercase tracking-[0.26em] text-cyan-200/70">
										{t("folders")}
									</p>
									<div className="mt-3">
										<div className="min-w-0">
											<h3 className="truncate text-lg font-semibold text-white">
												{folder.name}
											</h3>
										</div>
									</div>
								</button>
							))}
						</div>
					) : (
						<div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-400">
							{t("no_folders")}
						</div>
					)}
				</section>

				<section className="panel-card space-y-5">
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div className="space-y-2">
							<p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
								{t("files")}
							</p>
							<p className="text-sm text-slate-400">
								{currentFolder || t("root")}
							</p>
						</div>
						<button
							type="button"
							className="secondary-button h-[50px] rounded-[18px] px-5 text-sm"
							onClick={() =>
								void loadFiles({
									bucketId: selectedBucketId,
									folder: currentFolder,
								})
							}
						>
							{t("refresh")}
						</button>
					</div>

					{loading ? (
						<div className="rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
							{t("loading")}
						</div>
					) : totalFiles ? (
						<div className="space-y-3">
							{browser?.files.map((file) => {
								const shareUrl = file.share?.url ?? null;
								const isEditing = editingFile?.id === file.id;
								const isSharing = shareFile?.id === file.id;
								const isPreviewing = previewFile?.id === file.id;
								const isActive = isEditing || isSharing || isPreviewing;
								const fileExtension = getFileExtension(file.file_name);
								const canPreview = getPreviewKind(file) !== "unsupported";

								return (
									<article
										key={file.id}
										className={`rounded-[28px] border px-4 py-4 transition md:px-5 ${
											isActive
												? "border-cyan-300/22 bg-[linear-gradient(180deg,rgba(56,189,248,0.10),rgba(15,23,42,0.74))]"
												: "border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(9,14,27,0.72))] hover:border-white/12 hover:bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(9,14,27,0.78))]"
										}`}
									>
										<div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
											<div className="min-w-0 flex-1">
												<div className="flex items-start gap-4">
													<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-cyan-300/12 bg-cyan-300/10 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">
														{fileExtension}
													</div>

													<div className="min-w-0 flex-1 space-y-3">
														<div className="flex flex-wrap items-center gap-2">
															<h3
																className="min-w-0 truncate text-xl font-semibold tracking-tight text-white"
																title={file.file_name}
															>
																{file.file_name}
															</h3>
															<span
																className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
																	file.is_public
																		? "bg-emerald-400/15 text-emerald-200"
																		: "bg-amber-400/15 text-amber-100"
																}`}
															>
																{file.is_public ? t("public") : t("private")}
															</span>
															{file.share ? (
																<span className="inline-flex whitespace-nowrap rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
																	{t("share")} {file.share.visit_count}
																	{file.share.max_visits
																		? ` / ${file.share.max_visits}`
																		: ""}
																</span>
															) : null}
														</div>

														<div className="flex flex-wrap gap-2">
															<MetaPill
																label={t("current_folder")}
																value={file.folder_path || t("root")}
															/>
															<MetaPill
																label={t("bucket")}
																value={file.bucket_label}
															/>
														</div>

														<div className="flex flex-wrap gap-2">
															<RowMetric
																label={t("size")}
																value={formatBytes(file.size)}
															/>
															<RowMetric
																label={t("updated_at")}
																value={formatTimestamp(file.updated_at, locale)}
															/>
														</div>

														{shareUrl ? (
															<div className="rounded-[20px] border border-cyan-300/12 bg-cyan-300/[0.05] px-4 py-3">
																<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
																	<div className="min-w-0">
																		<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/70">
																			{t("share")}
																		</p>
																		<p
																			className="mt-1 truncate font-mono text-xs text-cyan-50"
																			title={shareUrl}
																		>
																			{shareUrl}
																		</p>
																	</div>
																	<button
																		type="button"
																		className="secondary-button rounded-[16px] px-4 py-2.5 text-sm md:w-auto"
																		onClick={() => handleCopy(shareUrl)}
																	>
																		{t("copy")}
																	</button>
																</div>
															</div>
														) : null}
													</div>
												</div>
											</div>

											<div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
												<a
													className={actionButtonClass("primary")}
													href={file.download_url}
												>
													{t("download")}
												</a>
												<button
													type="button"
													className={actionButtonClass()}
													onClick={() => handleCopy(file.download_url)}
												>
													{t("copy")}
												</button>
												{canPreview ? (
													<button
														type="button"
														className={actionButtonClass(isPreviewing ? "active" : "default")}
														onClick={() => openPreview(file)}
													>
														{t("preview")}
													</button>
												) : null}
												<button
													type="button"
													className={actionButtonClass(isEditing ? "active" : "default")}
													onClick={() => openEdit(file)}
												>
													{t("edit")}
												</button>
												<button
													type="button"
													className={actionButtonClass(isSharing ? "active" : "default")}
													onClick={() => openShare(file)}
												>
													{t("share")}
												</button>
												<button
													type="button"
													className={actionButtonClass("danger")}
													onClick={() => void handleDelete(file)}
												>
													{t("delete")}
												</button>
											</div>
										</div>
									</article>
								);
							})}
						</div>
					) : (
						<div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-slate-400">
							{t("no_files")}
						</div>
					)}
				</section>
				
					{isUploadDialogOpen ? (
						<DialogShell
							title={t("upload_title")}
							onClose={closeUploadDialog}
							disableClose={uploading}
						>
							<form className="space-y-4" onSubmit={handleUpload}>
								<div className="space-y-2">
									<label className="field-label">{t("upload_pick")}</label>
									<input
										className="field-input"
										type="file"
										disabled={uploading}
										onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
									/>
								</div>
								{uploadFile ? (
									<div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.07] p-4">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/75">
													{t("selected_file")}
												</p>
												<p
													className="mt-2 truncate text-sm font-semibold text-white"
													title={uploadFile.name}
												>
													{uploadFile.name}
												</p>
											</div>
											<span className="rounded-full border border-white/8 bg-white/[0.06] px-3 py-1 text-xs text-slate-300">
												{formatBytes(uploadFile.size)}
											</span>
										</div>
										<div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950/40">
											<div
												className="h-full rounded-full bg-[linear-gradient(90deg,#7dd3fc_0%,#38bdf8_45%,#2563eb_100%)] transition-all duration-300"
												style={{ width: `${uploading ? Math.max(uploadProgress, 8) : 8}%` }}
											/>
										</div>
										<div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-300">
											<p>
												{uploading
													? uploadProgress >= 100
														? t("upload_finishing")
														: `${t("uploading")} ${uploadProgress}%`
													: t("upload_ready")}
											</p>
											<p>{uploading ? `${uploadProgress}%` : formatBytes(uploadFile.size)}</p>
										</div>
									</div>
								) : null}
								<div className="space-y-2">
									<label className="field-label">{t("folder_path")}</label>
									<input
										className="field-input"
										value={uploadFolder}
										disabled={uploading}
										onChange={(event) => setUploadFolder(event.target.value)}
										placeholder="docs/releases"
									/>
								</div>
								<div className="space-y-2">
									<label className="field-label">{t("bucket")}</label>
									<select
										className="field-input"
										value={uploadBucketId ?? ""}
										disabled={uploading}
										onChange={(event) => setUploadBucketId(Number.parseInt(event.target.value, 10))}
									>
										{activeBuckets.map((bucket) => (
											<option key={bucket.id} value={bucket.id}>
												{bucket.bucket_name}
											</option>
										))}
									</select>
								</div>
								<label className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
									<input
										type="checkbox"
										checked={uploadIsPublic}
										onChange={(event) => setUploadIsPublic(event.target.checked)}
										disabled={uploading}
									/>
									<span>{uploadIsPublic ? t("public") : t("private")}</span>
								</label>
								<div className="flex gap-3">
									<button
										type="submit"
										className="primary-button flex-1"
										disabled={!uploadFile || uploading}
									>
										{uploading
											? uploadProgress >= 100
												? t("upload_finishing")
												: `${t("uploading")} ${uploadProgress}%`
											: t("upload_button")}
									</button>
									<button
										type="button"
										className="secondary-button flex-1"
										onClick={closeUploadDialog}
										disabled={uploading}
									>
										{t("cancel")}
									</button>
								</div>
							</form>
						</DialogShell>
					) : null}

					{editingFile ? (
						<DialogShell title={t("edit_file")} onClose={() => setEditingFile(null)}>
							<form className="space-y-4" onSubmit={handleSaveEdit}>
								<div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
									{editingFile.file_name}
								</div>
								<div className="space-y-2">
									<label className="field-label">{t("file_name")}</label>
									<input
										className="field-input"
										value={editFileName}
										onChange={(event) => setEditFileName(event.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<label className="field-label">{t("folder_path")}</label>
									<input
										className="field-input"
										value={editFolderPath}
										onChange={(event) => setEditFolderPath(event.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<label className="field-label">{t("bucket")}</label>
									<select
										className="field-input"
										value={editBucketId ?? ""}
										onChange={(event) => setEditBucketId(Number.parseInt(event.target.value, 10))}
									>
										{activeBuckets.map((bucket) => (
											<option key={bucket.id} value={bucket.id}>
												{bucket.bucket_name}
											</option>
										))}
									</select>
								</div>
								<label className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
									<input
										type="checkbox"
										checked={editIsPublic}
										onChange={(event) => setEditIsPublic(event.target.checked)}
									/>
									<span>{editIsPublic ? t("public") : t("private")}</span>
								</label>
								<div className="flex gap-3">
									<button type="submit" className="primary-button flex-1">
										{t("save")}
									</button>
									<button
										type="button"
										className="secondary-button flex-1"
										onClick={() => setEditingFile(null)}
									>
										{t("cancel")}
									</button>
								</div>
							</form>
						</DialogShell>
					) : null}

					{shareFile ? (
						<DialogShell title={t("share_settings")} onClose={() => setShareFile(null)}>
							<form className="space-y-4" onSubmit={handleShareSave}>
								<div className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
									<p className="font-semibold text-white">{shareFile.file_name}</p>
									<p className="mt-2 leading-7">
										{shareFile.is_public ? t("share_public_hint") : t("share_private_hint")}
									</p>
									{shareFile.share ? (
										<div className="mt-3 space-y-2">
											<p className="break-all font-mono text-xs text-cyan-100">
												{shareFile.share.url}
											</p>
											<button
												type="button"
												className="secondary-button px-3 py-2 text-sm"
												onClick={() => handleCopy(shareFile.share!.url)}
											>
												{t("copy_share_url")}
											</button>
										</div>
									) : null}
								</div>
								<div className="space-y-2">
									<label className="field-label">{t("max_visits")}</label>
									<input
										className="field-input"
										type="number"
										min="1"
										value={shareMaxVisits}
										onChange={(event) => setShareMaxVisits(event.target.value)}
										placeholder={t("visit_hint")}
									/>
								</div>
								<div className="space-y-2">
									<label className="field-label">{t("expires_at")}</label>
									<input
										className="field-input"
										type="datetime-local"
										value={shareExpiresAt}
										onChange={(event) => setShareExpiresAt(event.target.value)}
									/>
									<p className="text-xs text-slate-400">{t("datetime_hint")}</p>
								</div>
								<div className="flex flex-wrap gap-3">
									<button type="submit" className="primary-button flex-1">
										{t("share_generate")}
									</button>
									{shareFile.share ? (
										<button
											type="button"
											className="secondary-button flex-1"
											onClick={() => void handleDisableShare()}
										>
											{t("share_disable")}
										</button>
									) : null}
									<button
										type="button"
										className="secondary-button flex-1"
										onClick={() => setShareFile(null)}
									>
										{t("cancel")}
									</button>
								</div>
							</form>
						</DialogShell>
					) : null}

					{previewFile ? (
						<DialogShell
							title={`${t("preview")} - ${previewFile.file_name}`}
							onClose={() => setPreviewFile(null)}
							maxWidthClass={
								previewState.kind === "image" ||
								previewState.kind === "video" ||
								previewState.kind === "pdf"
									? "max-w-5xl"
									: "max-w-4xl"
							}
						>
							<div className="space-y-4">
								<div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4">
									<div className="flex flex-wrap items-center gap-2">
										<h4 className="text-lg font-semibold text-white">
											{previewFile.file_name}
										</h4>
										<span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-slate-300">
											{previewFile.content_type || "application/octet-stream"}
										</span>
										<span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-slate-300">
											{formatBytes(previewFile.size)}
										</span>
									</div>
									<div className="mt-4 flex flex-wrap gap-3">
										<a
											className="primary-button px-4 py-2.5 text-sm"
											href={previewFile.download_url}
										>
											{t("download")}
										</a>
										<button
											type="button"
											className="secondary-button px-4 py-2.5 text-sm"
											onClick={() => handleCopy(previewFile.download_url)}
										>
											{t("copy_download_url")}
										</button>
									</div>
								</div>

								{previewState.kind === "loading" ? (
									<div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-slate-300">
										{t("preview_loading")}
									</div>
								) : null}

								{previewState.kind === "error" ? (
									<div className="rounded-[24px] border border-rose-400/18 bg-rose-400/10 px-5 py-8 text-sm text-rose-100">
										{previewState.message || t("preview_error")}
									</div>
								) : null}

								{previewState.kind === "unsupported" ? (
									<div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-slate-300">
										{t("preview_not_supported")}
									</div>
								) : null}

								{previewState.kind === "text" ? (
									<pre className="max-h-[70vh] overflow-auto rounded-[24px] border border-white/10 bg-slate-950/55 px-5 py-5 text-sm leading-7 text-slate-100 whitespace-pre-wrap break-words">
										{previewState.text || t("preview_empty")}
									</pre>
								) : null}

								{previewState.kind === "image" && previewState.objectUrl ? (
									<div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
										<img
											src={previewState.objectUrl}
											alt={previewFile.file_name}
											className="mx-auto max-h-[70vh] rounded-[20px] object-contain"
										/>
									</div>
								) : null}

								{previewState.kind === "pdf" && previewState.objectUrl ? (
									<iframe
										src={previewState.objectUrl}
										title={previewFile.file_name}
										className="h-[70vh] w-full rounded-[24px] border border-white/10 bg-white"
									/>
								) : null}

								{previewState.kind === "video" && previewState.objectUrl ? (
									<video
										src={previewState.objectUrl}
										controls
										className="h-auto max-h-[70vh] w-full rounded-[24px] border border-white/10 bg-black"
									/>
								) : null}

								{previewState.kind === "audio" && previewState.objectUrl ? (
									<div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-8">
										<audio
											src={previewState.objectUrl}
											controls
											className="w-full"
										/>
									</div>
								) : null}
							</div>
						</DialogShell>
					) : null}
			</div>
		</div>
	);
}

function buildBreadcrumbs(path: string, rootLabel: string) {
	const parts = path ? path.split("/") : [];
	return [
		{ label: rootLabel, path: "" },
		...parts.map((segment, index) => ({
			label: segment,
			path: parts.slice(0, index + 1).join("/"),
		})),
	];
}

function actionButtonClass(
	variant: "default" | "active" | "danger" | "primary" = "default",
) {
	if (variant === "primary") {
		return "primary-button h-[46px] w-full rounded-[16px] px-4 py-2.5 text-sm";
	}

	if (variant === "danger") {
		return "secondary-button h-[46px] w-full rounded-[16px] border-rose-400/18 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-100 hover:bg-rose-400/18";
	}

	if (variant === "active") {
		return "secondary-button h-[46px] w-full rounded-[16px] border-cyan-300/28 bg-cyan-300/14 px-4 py-2.5 text-sm text-cyan-50 hover:bg-cyan-300/18";
	}

	return "secondary-button h-[46px] w-full rounded-[16px] px-4 py-2.5 text-sm";
}

function RowMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-[132px] rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2.5">
			<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
				{label}
			</p>
			<p className="mt-1 text-sm font-medium leading-5 text-white">{value}</p>
		</div>
	);
}

function MetaPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300">
			<span className="shrink-0 text-slate-500">{label}</span>
			<span className="truncate font-medium text-slate-100">{value}</span>
		</div>
	);
}

function getFileExtension(fileName: string) {
	const normalized = fileName.split(".").pop()?.trim().toUpperCase() || "";
	if (!normalized) {
		return "FILE";
	}

	return normalized.slice(0, 4);
}

type PreviewKind = "image" | "text" | "video" | "audio" | "pdf" | "unsupported";

type FilePreviewState =
	| { kind: "idle" | "loading" | "unsupported" }
	| { kind: "error"; message: string }
	| { kind: "text"; text: string }
	| { kind: "image" | "video" | "audio" | "pdf"; objectUrl: string };

function getPreviewKind(file: ManagedFile): PreviewKind {
	const contentType = (file.content_type ?? "").toLowerCase();
	const lowerName = file.file_name.toLowerCase();

	if (
		contentType.startsWith("image/") ||
		[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"].some(
			(suffix) => lowerName.endsWith(suffix),
		)
	) {
		return "image";
	}
	if (
		contentType.startsWith("video/") ||
		[".mp4", ".webm", ".mov", ".m4v", ".ogv"].some((suffix) =>
			lowerName.endsWith(suffix),
		)
	) {
		return "video";
	}
	if (
		contentType.startsWith("audio/") ||
		[".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"].some((suffix) =>
			lowerName.endsWith(suffix),
		)
	) {
		return "audio";
	}
	if (contentType === "application/pdf" || lowerName.endsWith(".pdf")) {
		return "pdf";
	}
	if (
		contentType.startsWith("text/") ||
		[
			"application/json",
			"application/xml",
			"application/javascript",
			"application/typescript",
			"application/x-sh",
			"application/yaml",
			"application/x-yaml",
		].includes(contentType) ||
		[
			".txt",
			".md",
			".json",
			".js",
			".ts",
			".tsx",
			".jsx",
			".css",
			".html",
			".xml",
			".yml",
			".yaml",
			".csv",
			".log",
			".ini",
		].some((suffix) => lowerName.endsWith(suffix))
	) {
		return "text";
	}

	return "unsupported";
}

async function extractResponseMessage(response: Response): Promise<string> {
	try {
		const payload = (await response.json()) as {
			error?: { message?: string };
		};
		if (payload?.error?.message) {
			return payload.error.message;
		}
	} catch {
		// Ignore JSON parse errors and fall back to status text.
	}

	return response.statusText || "Failed to load preview.";
}
