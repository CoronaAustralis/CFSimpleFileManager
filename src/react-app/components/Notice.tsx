export interface NoticeState {
	type: "success" | "error";
	message: string;
}

export function Notice({ notice }: { notice: NoticeState | null }) {
	if (!notice) {
		return null;
	}

	return (
		<div
			className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${
				notice.type === "success"
					? "border-emerald-400/50 bg-emerald-500/15 text-emerald-50"
					: "border-rose-400/50 bg-rose-500/15 text-rose-50"
			}`}
		>
			{notice.message}
		</div>
	);
}
