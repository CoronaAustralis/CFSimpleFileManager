import { useEffect, useEffectEvent, useState } from "react";
import { DialogShell } from "../components/DialogShell";
import { Notice, type NoticeState } from "../components/Notice";
import { bucketApi, type BucketListData } from "../lib/api";
import { useI18n } from "../lib/i18n";

export function SettingsPage() {
	const { t } = useI18n();
	const [bucketData, setBucketData] = useState<BucketListData | null>(null);
	const [notice, setNotice] = useState<NoticeState | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [bindingName, setBindingName] = useState("");
	const [bucketName, setBucketName] = useState("");
	const [previewBucketName, setPreviewBucketName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [deletingBucketId, setDeletingBucketId] = useState<number | null>(null);

	const loadBuckets = async () => {
		try {
			const data = await bucketApi.list();
			setBucketData(data);
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to load buckets.",
			});
		}
	};

	const loadBucketsEvent = useEffectEvent(loadBuckets);

	useEffect(() => {
		void loadBucketsEvent();
	}, []);

	useEffect(() => {
		if (!isDialogOpen) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isDialogOpen]);

	const openDialog = () => {
		setBindingName("");
		setBucketName("");
		setPreviewBucketName("");
		setIsDialogOpen(true);
	};

	const closeDialog = () => {
		if (submitting) {
			return;
		}

		setIsDialogOpen(false);
		setBindingName("");
		setBucketName("");
		setPreviewBucketName("");
	};

	const handleCreateBucket = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (submitting) {
			return;
		}

		try {
			setSubmitting(true);
			setNotice(null);
			await bucketApi.create({
				binding_name: bindingName,
				bucket_name: bucketName,
				preview_bucket_name: previewBucketName || null,
			});
			setNotice({
				type: "success",
				message: t("notice_bucket_added"),
			});
			setIsDialogOpen(false);
			setBindingName("");
			setBucketName("");
			setPreviewBucketName("");
			await loadBuckets();
		} catch (error) {
			setNotice({
				type: "error",
				message:
					error instanceof Error
						? error.message
						: "Failed to add bucket.",
			});
		} finally {
			setSubmitting(false);
		}
	};

	const handleDeleteBucket = async (bucketId: number) => {
		if (deletingBucketId !== null || !window.confirm(t("confirm_delete_bucket"))) {
			return;
		}

		try {
			setDeletingBucketId(bucketId);
			setNotice(null);
			await bucketApi.remove(bucketId);
			setNotice({
				type: "success",
				message: t("notice_bucket_removed"),
			});
			await loadBuckets();
		} catch (error) {
			setNotice({
				type: "error",
				message:
					error instanceof Error
						? error.message
						: "Failed to delete bucket.",
			});
		} finally {
			setDeletingBucketId(null);
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h2 className="section-title">{t("buckets_page_title")}</h2>
				<p className="section-subtitle">{t("buckets_page_subtitle")}</p>
			</div>

			<Notice notice={notice} />

			<section className="panel-card space-y-4">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-2">
						<h3 className="text-lg font-semibold text-white">{t("buckets_title")}</h3>
						<p className="text-sm leading-7 text-slate-400">
							{t("bucket_source_hint")}
						</p>
					</div>
					<button
						type="button"
						className="primary-button shrink-0 rounded-[18px] px-5 py-3 text-sm"
						onClick={openDialog}
					>
						{t("add_bucket")}
					</button>
				</div>
				<div className="table-shell">
					<table>
						<thead>
							<tr>
								<th>ID</th>
								<th>{t("bucket_name")}</th>
								<th>{t("preview_name")}</th>
								<th>{t("default")}</th>
							</tr>
						</thead>
						<tbody>
							{bucketData?.buckets.length ? (
								bucketData.buckets.map((bucket) => (
									<tr key={bucket.id}>
										<td className="text-sm text-slate-300">{bucket.id}</td>
										<td className="text-sm text-slate-100">{bucket.bucket_name}</td>
										<td className="text-sm text-slate-300">
											{bucket.preview_bucket_name || "—"}
										</td>
										<td className="text-sm text-slate-300">
											{bucket.is_default === 1 ? (
												t("default")
											) : (
												<button
													type="button"
													className="secondary-button rounded-[14px] border-rose-400/18 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-100 hover:bg-rose-400/18"
													onClick={() => void handleDeleteBucket(bucket.id)}
													disabled={deletingBucketId === bucket.id}
												>
													{deletingBucketId === bucket.id
														? `${t("delete")}...`
														: t("delete")}
												</button>
											)}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="text-sm text-slate-400">
										{t("no_buckets_found")}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			{isDialogOpen ? (
				<DialogShell title={t("add_bucket_title")} onClose={closeDialog} disableClose={submitting}>
					<form className="space-y-4" onSubmit={handleCreateBucket}>
						<div className="rounded-[20px] border border-cyan-300/14 bg-cyan-300/[0.06] px-4 py-4 text-sm leading-7 text-slate-200">
							<p>{t("add_bucket_hint")}</p>
							<p className="mt-2 text-xs text-cyan-100/80">{t("bucket_read_hint")}</p>
						</div>
						<div className="space-y-2">
							<label className="field-label">{t("binding_name")}</label>
							<input
								className="field-input"
								value={bindingName}
								onChange={(event) => setBindingName(event.target.value)}
								placeholder={t("binding_name_placeholder")}
								disabled={submitting}
							/>
						</div>
						<div className="space-y-2">
							<label className="field-label">{t("bucket_name")}</label>
							<input
								className="field-input"
								value={bucketName}
								onChange={(event) => setBucketName(event.target.value)}
								placeholder={t("bucket_name_placeholder")}
								disabled={submitting}
							/>
						</div>
						<div className="space-y-2">
							<label className="field-label">{t("preview_name")}</label>
							<input
								className="field-input"
								value={previewBucketName}
								onChange={(event) => setPreviewBucketName(event.target.value)}
								placeholder={t("preview_name_placeholder")}
								disabled={submitting}
							/>
						</div>
						<div className="flex gap-3">
							<button
								type="submit"
								className="primary-button flex-1"
								disabled={!bindingName.trim() || !bucketName.trim() || submitting}
							>
								{t("add_bucket_submit")}
							</button>
							<button
								type="button"
								className="secondary-button flex-1"
								onClick={closeDialog}
								disabled={submitting}
							>
								{t("cancel")}
							</button>
						</div>
					</form>
				</DialogShell>
			) : null}
		</div>
	);
}
