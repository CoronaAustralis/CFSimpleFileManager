import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Notice } from "../components/Notice";
import { ApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAppState } from "../App";

export function LoginPage() {
	const app = useAppState();
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useI18n();
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!app.loading && app.session) {
		const state = location.state as { from?: string } | null;
		return <Navigate to={state?.from || "/"} replace />;
	}

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitting(true);
		setError(null);

		try {
			await app.login(password);
			const state = location.state as { from?: string } | null;
			navigate(state?.from || "/", { replace: true });
		} catch (caughtError) {
			if (caughtError instanceof ApiError) {
				setError(caughtError.message);
			} else {
				setError("Login failed.");
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.18),_transparent_26%),linear-gradient(180deg,_#050816_0%,_#0b1224_55%,_#070d1b_100%)] px-4 py-10">
			<div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
				<div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.1fr)_460px]">
					<section className="glass-panel hidden rounded-[34px] p-8 lg:block">
						<p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">
							Cloudflare file manager
						</p>
						<h1 className="mt-4 font-['Aptos','Trebuchet_MS',sans-serif] text-5xl font-semibold leading-tight text-white">
							{t("login_title")}
						</h1>
						<p className="mt-5 max-w-xl text-base leading-8 text-slate-300">
							{t("login_subtitle")}
						</p>

						<div className="mt-8 grid gap-4 sm:grid-cols-2">
							<FeatureCard
								title="D1"
								text="Metadata stays small and query-friendly."
							/>
							<FeatureCard
								title="R2"
								text="Binary content lives in object storage where it belongs."
							/>
							<FeatureCard
								title="Token"
								text="Scripts upload and download without depending on a browser login."
							/>
							<FeatureCard
								title="Short links"
								text="Files can expose visit-limited links without reviving the old short-url sprawl."
							/>
						</div>
					</section>

					<section className="glass-panel rounded-[34px] p-7 shadow-2xl shadow-slate-950/40 lg:p-8">
						<div className="space-y-2">
							<h2 className="font-['Aptos','Trebuchet_MS',sans-serif] text-3xl font-semibold text-white">
								{t("login_title")}
							</h2>
							<p className="text-sm leading-7 text-slate-300">
								{t("login_subtitle")}
							</p>
						</div>

						<form className="mt-8 space-y-5" onSubmit={handleSubmit}>
							<div className="space-y-2">
								<label className="field-label">{t("login_admin")}</label>
								<div className="field-input">
									{t("login_admin_value")}
								</div>
							</div>

							<div className="space-y-2">
								<label className="field-label" htmlFor="password">
									{t("login_password")}
								</label>
								<input
									id="password"
									type="password"
									className="field-input"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									autoComplete="current-password"
									required
								/>
							</div>

							<Notice
								notice={error ? { type: "error", message: error } : null}
							/>

							<button type="submit" className="primary-button w-full" disabled={submitting}>
								{submitting ? `${t("login_button")}…` : t("login_button")}
							</button>
						</form>
					</section>
				</div>
			</div>
		</div>
	);
}

function FeatureCard({ title, text }: { title: string; text: string }) {
	return (
		<div className="rounded-[26px] border border-white/10 bg-white/6 p-5">
			<p className="text-xs uppercase tracking-[0.3em] text-cyan-200/75">{title}</p>
			<p className="mt-3 text-sm leading-7 text-slate-300">{text}</p>
		</div>
	);
}
