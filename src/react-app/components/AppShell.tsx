import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useI18n } from "../lib/i18n";

export function AppShell({
	children,
	onLogout,
}: {
	children: ReactNode;
	onLogout: () => void;
}) {
	const { locale, setLocale, t } = useI18n();

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.16),_transparent_28%),linear-gradient(180deg,_#07111f_0%,_#0b1527_42%,_#08111d_100%)] text-slate-50">
			<div className="mx-auto flex min-h-screen w-full max-w-[1540px] flex-col gap-6 px-4 py-5 lg:px-6">
				<header className="glass-panel flex flex-col gap-5 rounded-[30px] px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-[0.35em] text-cyan-200/75">
							Cloudflare Worker + D1 + R2
						</p>
						<div>
							<h1 className="font-['Aptos','Trebuchet_MS',sans-serif] text-3xl font-semibold tracking-tight text-white">
								{t("app_title")}
							</h1>
							<p className="max-w-2xl text-sm text-slate-300">
								{t("app_subtitle")}
							</p>
						</div>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<select
							className="rounded-2xl border border-white/15 bg-white/8 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
							value={locale}
							onChange={(event) =>
								setLocale(event.target.value as "en" | "zh-CN")
							}
						>
							<option value="en">English</option>
							<option value="zh-CN">简体中文</option>
						</select>
						<button
							type="button"
							className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
							onClick={onLogout}
						>
							{t("logout")}
						</button>
					</div>
				</header>

				<div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
					<nav className="glass-panel flex flex-row gap-3 overflow-x-auto rounded-[30px] p-3 lg:flex-col lg:gap-2">
						<NavItem to="/" label={t("nav_files")} />
						<NavItem to="/tokens" label={t("nav_tokens")} />
						<NavItem to="/settings" label={t("nav_buckets")} />
					</nav>

					<main className="glass-panel rounded-[30px] p-4 shadow-2xl shadow-slate-950/30 lg:p-7">
						{children}
					</main>
				</div>
			</div>
		</div>
	);
}

function NavItem({ to, label }: { to: string; label: string }) {
	return (
		<NavLink
			to={to}
			end={to === "/"}
			className={({ isActive }) =>
				[
					"rounded-2xl px-4 py-3 text-sm font-medium transition",
					isActive
						? "bg-[linear-gradient(135deg,#7dd3fc,#2563eb)] text-white shadow-lg shadow-sky-900/30"
						: "bg-white/6 text-slate-200 hover:bg-white/14",
				].join(" ")
			}
		>
			{label}
		</NavLink>
	);
}
