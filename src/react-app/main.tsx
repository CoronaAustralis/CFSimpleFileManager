import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";
import { I18nProvider } from "./lib/i18n";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<I18nProvider>
			<BrowserRouter basename={import.meta.env.BASE_URL}>
				<App />
			</BrowserRouter>
		</I18nProvider>
	</StrictMode>,
);
