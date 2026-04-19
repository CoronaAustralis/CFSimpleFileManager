import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

type Locale = "en" | "zh-CN";

const STORAGE_KEY = "cfm_locale";

const dictionaries: Record<Locale, Record<string, string>> = {
	en: {
		app_title: "Cloud File Manager",
		app_subtitle:
			"Single-admin file management with browser sessions for humans and Bearer tokens for scripts.",
		nav_files: "Files",
		nav_tokens: "Tokens",
		nav_buckets: "Buckets",
		logout: "Logout",
		loading: "Loading workspace…",
		save: "Save",
		cancel: "Cancel",
		delete: "Delete",
		disable: "Disable",
		edit: "Edit",
		show: "Show",
		copy: "Copy",
		download: "Download",
		refresh: "Refresh",
		search: "Search",
		public: "Public",
		private: "Private",
		enabled: "Enabled",
		disabled: "Disabled",
		default: "Default",
		root: "Root",
		login_title: "Single-admin file cockpit",
		login_subtitle:
			"Sign in with the environment password. API tokens stay separate for curl and scripts.",
		login_admin: "Account",
		login_admin_value: "admin",
		login_password: "Password",
		login_button: "Enter dashboard",
		files_title: "File desk",
		files_subtitle:
			"Upload, browse, rename, move, download, and share files without the old template-heavy complexity.",
		upload_title: "Upload file",
		upload_button: "Upload now",
		upload_pick: "Choose file",
		uploading: "Uploading",
		upload_ready: "Ready to upload",
		selected_file: "Selected file",
		upload_finishing: "Finishing upload…",
		folder_path: "Folder path",
		bucket: "Bucket",
		current_folder: "Current folder",
		search_placeholder: "Search by file or folder",
		folders: "Folders",
		files: "Files",
		no_folders: "No folders here yet.",
		no_files: "No files matched this view.",
		file_name: "File name",
		size: "Size",
		downloads: "Downloads",
		updated_at: "Updated",
		share: "Short link",
		share_settings: "Share settings",
		share_generate: "Create or rotate short link",
		share_disable: "Disable short link",
		share_private_hint:
			"Private files still need a session or Bearer token for direct download URLs, but the short link itself can be opened anonymously.",
		share_public_hint:
			"Public files can be opened anonymously through either the download URL or the short link.",
		max_visits: "Max visits",
		expires_at: "Expires at",
		copy_download_url: "Copy download URL",
		copy_share_url: "Copy short link",
		delete_file: "Delete file",
		edit_file: "Edit file",
		tokens_title: "Script tokens",
		tokens_subtitle:
			"Create long-lived Bearer tokens for curl, scripts, cron jobs, or CI. Each token is shown in full only once.",
		token_name: "Token name",
		token_create: "Create token",
		token_rotate: "Rotate",
		token_show: "Show",
		token_last_used: "Last used",
		token_plaintext: "Current token",
		token_plaintext_hint:
			"Create, rotate, or reveal a token here, then copy it into your scripts or curl commands.",
		token_selected: "Selected token",
		curl_examples: "curl examples",
		buckets_page_title: "Bucket list",
		buckets_page_subtitle:
			"Review available R2 buckets here and add more after binding them to the Worker.",
		buckets_title: "Configured buckets",
		binding_name: "Binding name",
		bucket_name: "Bucket name",
		preview_name: "Preview name",
		bucket_source_hint:
			"Configured buckets from deployment are shown here, and you can also add more after providing both the Worker binding name and the bucket name.",
		no_buckets_found: "No buckets available yet.",
		actions: "Actions",
		notice_saved: "Saved successfully.",
		notice_deleted: "Deleted successfully.",
		notice_copied: "Copied to clipboard.",
		notice_uploaded: "Upload finished.",
		notice_share_disabled: "Short link disabled.",
		notice_token_disabled: "Token disabled.",
		notice_token_shown: "Token displayed below.",
		confirm_delete_file: "Delete this file from D1 and R2?",
		datetime_hint: "Leave empty for no expiry.",
		visit_hint: "Leave empty for no limit.",
		curl_upload: "Upload",
		curl_download: "Download",
		curl_list: "List files",
		file_edit_hint:
			"Select a file and open edit mode to rename it, move folders, switch buckets, or change its access level.",
		share_empty_hint:
			"Open share settings on any file to generate a short link with an optional expiry timestamp or visit limit.",
		add_bucket: "Add",
		add_bucket_title: "Add bucket",
		add_bucket_submit: "Verify and add",
		add_bucket_hint:
			"Enter both the Worker binding name and the R2 bucket name. The app verifies the binding can be read before saving it here.",
		binding_name_placeholder: "FILES_ARCHIVE",
		bucket_name_placeholder: "box",
		preview_name_placeholder: "box-preview",
		notice_bucket_added: "Bucket added successfully.",
		notice_bucket_removed: "Bucket removed successfully.",
		bucket_read_hint:
			"If validation fails, bind this R2 bucket to the current Worker in Cloudflare first and make sure the binding name matches.",
		confirm_delete_bucket:
			"Remove this bucket from the app? This will only hide the bucket here and will not delete files from R2.",
	},
	"zh-CN": {
		app_title: "Cloud File Manager",
		app_subtitle: "单管理员文件管理，网页登录给人用，Bearer Token 给脚本用。",
		nav_files: "文件",
		nav_tokens: "令牌",
		nav_buckets: "存储桶",
		logout: "退出登录",
		loading: "正在加载工作台…",
		save: "保存",
		cancel: "取消",
		delete: "删除",
		disable: "停用",
		edit: "编辑",
		show: "显示",
		copy: "复制",
		download: "下载",
		refresh: "刷新",
		search: "搜索",
		public: "公开",
		private: "私有",
		enabled: "启用",
		disabled: "停用",
		default: "默认",
		root: "根目录",
		login_title: "单管理员文件控制台",
		login_subtitle:
			"网页登录只用环境变量密码，curl 和脚本走独立 API Token。",
		login_admin: "账号",
		login_admin_value: "admin",
		login_password: "密码",
		login_button: "进入面板",
		files_title: "文件工作台",
		files_subtitle:
			"围绕上传、浏览、移动、下载和短链分享设计，不再保留旧项目那套模板系统复杂度。",
		upload_title: "上传文件",
		upload_button: "立即上传",
		upload_pick: "选择文件",
		uploading: "上传中",
		upload_ready: "准备上传",
		selected_file: "已选文件",
		upload_finishing: "正在完成上传…",
		folder_path: "目录路径",
		bucket: "存储桶",
		current_folder: "当前目录",
		search_placeholder: "按文件名或目录搜索",
		folders: "目录",
		files: "文件",
		no_folders: "当前目录还没有子目录。",
		no_files: "当前视图没有匹配文件。",
		file_name: "文件名",
		size: "大小",
		downloads: "下载次数",
		updated_at: "更新时间",
		share: "短链接",
		share_settings: "短链设置",
		share_generate: "创建或轮换短链",
		share_disable: "停用短链",
		share_private_hint:
			"私有文件的直链下载仍然需要 Session 或 Bearer Token，但短链本身可以匿名访问。",
		share_public_hint:
			"公开文件既可以匿名走下载地址，也可以匿名走短链。",
		max_visits: "最大访问次数",
		expires_at: "过期时间",
		copy_download_url: "复制下载地址",
		copy_share_url: "复制短链",
		delete_file: "删除文件",
		edit_file: "编辑文件",
		tokens_title: "脚本令牌",
		tokens_subtitle:
			"给 curl、脚本、定时任务或 CI 创建长期 Bearer Token。完整令牌只会展示一次。",
		token_name: "令牌名称",
		token_create: "创建令牌",
		token_rotate: "轮换",
		token_show: "显示",
		token_last_used: "最近使用",
		token_plaintext: "当前令牌",
		token_plaintext_hint: "在这里创建、轮换或显示令牌，然后直接复制到脚本或 curl 命令里。",
		token_selected: "当前选中",
		curl_examples: "curl 示例",
		buckets_page_title: "存储桶列表",
		buckets_page_subtitle:
			"这里可以查看当前可用的 R2 存储桶，也可以在完成 Worker 绑定后继续添加新的桶。",
		buckets_title: "已配置存储桶",
		binding_name: "绑定名",
		bucket_name: "桶名",
		preview_name: "预览桶名",
		bucket_source_hint:
			"这里会显示部署配置里的桶，也支持你在 Cloudflare 绑定完成后，填写绑定名和桶名继续补充。",
		no_buckets_found: "当前还没有可用的存储桶。",
		actions: "操作",
		notice_saved: "保存成功。",
		notice_deleted: "删除成功。",
		notice_copied: "已复制到剪贴板。",
		notice_uploaded: "上传完成。",
		notice_share_disabled: "短链已停用。",
		notice_token_disabled: "令牌已停用。",
		notice_token_shown: "令牌已显示在下方。",
		confirm_delete_file: "确认同时从 D1 和 R2 删除这个文件吗？",
		datetime_hint: "留空表示永不过期。",
		visit_hint: "留空表示不限制次数。",
		curl_upload: "上传",
		curl_download: "下载",
		curl_list: "列出文件",
		file_edit_hint:
			"先选择一个文件再进入编辑模式，可以重命名、移动目录、切换存储桶或修改访问权限。",
		share_empty_hint:
			"在任意文件上打开短链设置，即可生成带过期时间或访问次数限制的短链接。",
		add_bucket: "添加",
		add_bucket_title: "添加存储桶",
		add_bucket_submit: "验证并添加",
		add_bucket_hint:
			"填写当前 Worker 里的 binding 名和 R2 桶名。保存前系统会先验证这个 binding 是否真的可读。",
		binding_name_placeholder: "FILES_ARCHIVE",
		bucket_name_placeholder: "box",
		preview_name_placeholder: "box-preview",
		notice_bucket_added: "存储桶已添加。",
		notice_bucket_removed: "存储桶已删除。",
		bucket_read_hint:
			"如果验证失败，请先去 Cloudflare 页面把这个桶绑定到当前 Worker，并确认 binding 名一致后再回来重试。",
		confirm_delete_bucket:
			"确认从应用里移除这个存储桶吗？这不会删除 R2 里的真实文件，只是这里不再显示。",
	},
};

interface I18nContextValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved === "en" || saved === "zh-CN") {
		return saved;
	}

	return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocale] = useState<Locale>(() => getInitialLocale());

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, locale);
	}, [locale]);

	const value = useMemo<I18nContextValue>(
		() => ({
			locale,
			setLocale,
			t: (key) => dictionaries[locale][key] ?? key,
		}),
		[locale],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useI18n must be used inside I18nProvider.");
	}

	return context;
}
