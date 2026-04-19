import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	Navigate,
	Outlet,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router";
import { AppShell } from "./components/AppShell";
import { authApi, type AuthSession } from "./lib/api";
import { useI18n } from "./lib/i18n";
import { FilesPage } from "./pages/FilesPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TokensPage } from "./pages/TokensPage";

interface AppStateValue {
	session: AuthSession | null;
	loading: boolean;
	login: (password: string) => Promise<void>;
	logout: () => Promise<void>;
	refreshSession: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function App() {
	return (
		<AppStateProvider>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route element={<ProtectedLayout />}>
					<Route path="/" element={<FilesPage />} />
					<Route path="/tokens" element={<TokensPage />} />
					<Route path="/settings" element={<SettingsPage />} />
				</Route>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</AppStateProvider>
	);
}

function AppStateProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [loading, setLoading] = useState(true);

	const refreshSession = async () => {
		try {
			const nextSession = await authApi.me();
			setSession(nextSession);
		} catch {
			setSession(null);
		}
	};

	useEffect(() => {
		void (async () => {
			await refreshSession();
			setLoading(false);
		})();
	}, []);

	const value = useMemo<AppStateValue>(
		() => ({
			session,
			loading,
			login: async (password: string) => {
				await authApi.login(password);
				await refreshSession();
			},
			logout: async () => {
				await authApi.logout();
				setSession(null);
			},
			refreshSession,
		}),
		[loading, session],
	);

	return (
		<AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
	);
}

function ProtectedLayout() {
	const app = useAppState();
	const location = useLocation();
	const navigate = useNavigate();
	const { t } = useI18n();

	if (app.loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
				{t("loading")}
			</div>
		);
	}

	if (!app.session) {
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}

	return (
		<AppShell
			onLogout={() => {
				void app.logout().then(() => {
					navigate("/login", { replace: true });
				});
			}}
		>
			<Outlet />
		</AppShell>
	);
}

export function useAppState() {
	const context = useContext(AppStateContext);
	if (!context) {
		throw new Error("useAppState must be used inside AppStateProvider.");
	}

	return context;
}
