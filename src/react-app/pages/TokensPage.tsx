import { useEffect, useState } from "react";
import { Notice, type NoticeState } from "../components/Notice";
import { bucketApi, tokenApi, type BucketRecord, type TokenListItem } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { copyText, formatTimestamp } from "../lib/utils";

export function TokensPage() {
	const { locale, t } = useI18n();
	const [tokens, setTokens] = useState<TokenListItem[]>([]);
	const [buckets, setBuckets] = useState<BucketRecord[]>([]);
	const [tokenName, setTokenName] = useState("");
	const [latestToken, setLatestToken] = useState("");
	const [selectedTokenName, setSelectedTokenName] = useState("");
	const [notice, setNotice] = useState<NoticeState | null>(null);
	const [loading, setLoading] = useState(true);

	const loadPage = async () => {
		setLoading(true);
		try {
			const [tokenData, bucketData] = await Promise.all([
				tokenApi.list(),
				bucketApi.list(),
			]);
			setTokens(tokenData.tokens);
			setBuckets(bucketData.buckets);
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to load tokens.",
			});
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadPage();
	}, []);

	const handleCopyValue = (value: string) => {
		void copyText(value).then(() =>
			setNotice({
				type: "success",
				message: t("notice_copied"),
			}),
		);
	};

	const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!tokenName.trim()) {
			return;
		}

		try {
			const created = await tokenApi.create(tokenName.trim());
			setLatestToken(created.token);
			setSelectedTokenName(created.name);
			setTokenName("");
			setNotice({ type: "success", message: t("notice_saved") });
			await loadPage();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to create token.",
			});
		}
	};

	const handleRotate = async (tokenId: number) => {
		try {
			const rotated = await tokenApi.rotate(tokenId);
			setLatestToken(rotated.token);
			setSelectedTokenName(rotated.name);
			setNotice({ type: "success", message: t("notice_saved") });
			await loadPage();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to rotate token.",
			});
		}
	};

	const handleReveal = async (tokenId: number) => {
		try {
			const revealed = await tokenApi.reveal(tokenId);
			setLatestToken(revealed.token);
			setSelectedTokenName(revealed.name);
			setNotice({ type: "success", message: t("notice_token_shown") });
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to reveal token.",
			});
		}
	};

	const handleDisable = async (tokenId: number) => {
		try {
			await tokenApi.disable(tokenId);
			setNotice({ type: "success", message: t("notice_token_disabled") });
			await loadPage();
		} catch (error) {
			setNotice({
				type: "error",
				message: error instanceof Error ? error.message : "Failed to disable token.",
			});
		}
	};

	const origin = window.location.origin;
	const sampleBucketId = buckets[0]?.id ?? 1;
	const tokenValue = latestToken || "$TOKEN";
	const sampleFolderPath = "docs";
	const sampleFileName = "example.txt";
	const sampleFileRef = "FILE_REF";

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h2 className="section-title">{t("tokens_title")}</h2>
					<p className="section-subtitle">{t("tokens_subtitle")}</p>
				</div>
				<button type="button" className="secondary-button" onClick={() => void loadPage()}>
					{t("refresh")}
				</button>
			</div>

			<Notice notice={notice} />

			<div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
				<section className="panel-card space-y-4">
					<h3 className="text-lg font-semibold text-white">{t("token_create")}</h3>
					<form className="space-y-4" onSubmit={handleCreate}>
						<div className="space-y-2">
							<label className="field-label">{t("token_name")}</label>
							<input
								className="field-input"
								value={tokenName}
								onChange={(event) => setTokenName(event.target.value)}
								placeholder="deploy-script"
							/>
						</div>
						<button type="submit" className="primary-button w-full">
							{t("token_create")}
						</button>
					</form>

						<div className="rounded-[22px] border border-cyan-300/25 bg-cyan-400/10 p-4">
						<div className="flex items-center justify-between gap-3">
							<div className="space-y-1">
								<h4 className="text-sm font-semibold text-cyan-100">
									{t("token_plaintext")}
								</h4>
								{selectedTokenName ? (
									<p className="text-xs text-cyan-50/85">
										{t("token_selected")}: {selectedTokenName}
									</p>
								) : null}
							</div>
							{latestToken ? (
								<button
									type="button"
									className="secondary-button px-3 py-2 text-sm"
									onClick={() => handleCopyValue(latestToken)}
								>
									{t("copy")}
								</button>
							) : null}
						</div>
						<p className="mt-2 break-all rounded-2xl bg-slate-950/45 px-3 py-3 font-mono text-xs text-cyan-100">
							{latestToken || "cfm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
						</p>
						<p className="mt-3 text-sm leading-6 text-slate-300">
							{t("token_plaintext_hint")}
						</p>
					</div>
				</section>

				<section className="space-y-6">
					<div className="panel-card">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-lg font-semibold text-white">{t("nav_tokens")}</h3>
							<span className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">
								{tokens.length}
							</span>
						</div>

						{loading ? (
							<p className="text-sm text-slate-300">{t("loading")}</p>
						) : (
							<div className="space-y-3">
								{tokens.map((token) => (
									<div
										key={token.id}
										className="rounded-[22px] border border-white/10 bg-white/5 p-4"
									>
										<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
											<div className="space-y-1">
												<div className="flex items-center gap-3">
													<h4 className="text-base font-semibold text-white">
														{token.name}
													</h4>
													<span
														className={`rounded-full px-3 py-1 text-xs font-semibold ${
															token.is_active
																? "bg-emerald-400/15 text-emerald-200"
																: "bg-rose-400/15 text-rose-200"
														}`}
													>
														{token.is_active ? t("enabled") : t("disabled")}
													</span>
												</div>
												<p className="font-mono text-xs text-slate-300">
													{token.token_prefix}…
												</p>
												<p className="text-sm text-slate-400">
													{t("token_last_used")}:{" "}
													{formatTimestamp(token.last_used_at, locale)}
												</p>
											</div>

											<div className="flex flex-wrap gap-2">
												<button
													type="button"
													className="secondary-button px-3 py-2 text-sm"
													onClick={() => void handleReveal(token.id)}
												>
													{t("token_show")}
												</button>
												<button
													type="button"
													className="secondary-button px-3 py-2 text-sm"
													onClick={() => void handleRotate(token.id)}
												>
													{t("token_rotate")}
												</button>
												<button
													type="button"
													className="secondary-button px-3 py-2 text-sm"
													onClick={() => void handleDisable(token.id)}
												>
													{t("disable")}
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="panel-card space-y-4">
						<h3 className="text-lg font-semibold text-white">{t("curl_examples")}</h3>
						<CodeBlock
							label={t("curl_list")}
							code={`curl --get "${origin}/api/files" \\
  -H "Authorization: Bearer ${tokenValue}" \\
  --data-urlencode "bucket_id=${sampleBucketId}" \\
  --data-urlencode "folder_path=${sampleFolderPath}"`}
						/>
						<CodeBlock
							label={t("curl_upload")}
							code={`curl -X POST "${origin}/api/files/upload" \\
  -H "Authorization: Bearer ${tokenValue}" \\
  -F "file=@./example.txt" \\
  -F "folder_path=${sampleFolderPath}" \\
  -F "bucket_id=${sampleBucketId}" \\
  -F "is_public=0"`}
						/>
						<CodeBlock
							label={t("curl_download_by_path")}
							code={`curl -L --get "${origin}/api/files/download" \\
  -H "Authorization: Bearer ${tokenValue}" \\
  --data-urlencode "bucket_id=${sampleBucketId}" \\
  --data-urlencode "folder_path=${sampleFolderPath}" \\
  --data-urlencode "file_name=${sampleFileName}" \\
  -o ${sampleFileName}`}
						/>
						<CodeBlock
							label={t("curl_download_by_ref")}
							code={`curl -L "${origin}/api/files/${sampleFileRef}/download" \\
  -H "Authorization: Bearer ${tokenValue}" \\
  -o ${sampleFileName}`}
							hint={t("file_ref_hint")}
						/>
					</div>
				</section>
			</div>
		</div>
	);
}

function CodeBlock({
	label,
	code,
	hint,
}: {
	label: string;
	code: string;
	hint?: string;
}) {
	return (
		<div className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
			<p className="mb-3 text-xs uppercase tracking-[0.3em] text-cyan-200/70">
				{label}
			</p>
			<pre className="overflow-x-auto whitespace-pre-wrap break-all text-sm text-slate-200">
				<code>{code}</code>
			</pre>
			{hint ? <p className="mt-3 text-sm leading-6 text-slate-400">{hint}</p> : null}
		</div>
	);
}
