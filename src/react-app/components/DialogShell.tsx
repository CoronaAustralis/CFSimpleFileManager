import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function DialogShell({
	title,
	children,
	onClose,
	disableClose = false,
	maxWidthClass = "max-w-2xl",
}: {
	title: string;
	children: ReactNode;
	onClose: () => void;
	disableClose?: boolean;
	maxWidthClass?: string;
}) {
	useEffect(() => {
		if (disableClose) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [disableClose, onClose]);

	if (typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div
			className="fixed inset-0 z-[140] overflow-y-auto bg-slate-950/72 backdrop-blur-md"
			onClick={(event) => {
				if (disableClose) {
					return;
				}

				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div className="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6">
				<div
					className={`my-auto flex max-h-[min(88vh,960px)] w-full flex-col overflow-hidden rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(11,20,36,0.98)_0%,rgba(18,31,54,0.96)_100%)] shadow-[0_28px_90px_rgba(2,6,23,0.55)] ${maxWidthClass}`}
				>
					<div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/72">
								File Manager
							</p>
							<h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
								{title}
							</h3>
						</div>
						<button
							type="button"
							className="secondary-button h-11 w-11 shrink-0 rounded-2xl px-0 text-lg"
							onClick={onClose}
							disabled={disableClose}
							aria-label={title}
						>
							×
						</button>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
						{children}
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
