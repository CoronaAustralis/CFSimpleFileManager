import wranglerConfigRaw from "../../wrangler.jsonc?raw";

export interface ConfiguredR2Bucket {
	id: number;
	binding: string;
	bucket_name: string;
	preview_bucket_name: string | null;
	is_default: boolean;
}

interface WranglerConfigShape {
	r2_buckets?: Array<{
		binding?: string;
		bucket_name?: string;
		preview_bucket_name?: string;
	}>;
}

const parsedConfig = parseJsonc(wranglerConfigRaw) as WranglerConfigShape;

export const configuredR2Buckets: ConfiguredR2Bucket[] = (
	parsedConfig.r2_buckets ?? []
)
	.filter(
		(bucket): bucket is { binding: string; bucket_name: string; preview_bucket_name?: string } =>
			typeof bucket?.binding === "string" &&
			typeof bucket?.bucket_name === "string",
	)
	.map((bucket, index) => ({
		id: index + 1,
		binding: bucket.binding,
		bucket_name: bucket.bucket_name,
		preview_bucket_name:
			typeof bucket.preview_bucket_name === "string"
				? bucket.preview_bucket_name
				: null,
		is_default: bucket.binding === "FILES_DEFAULT" || index === 0,
	}))
	.map((bucket, index, allBuckets) => ({
		...bucket,
		is_default:
			bucket.binding === "FILES_DEFAULT" ||
			(!allBuckets.some((item) => item.binding === "FILES_DEFAULT") &&
				index === 0),
	}));

function parseJsonc(input: string): unknown {
	const withoutComments = stripComments(input);
	const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");
	return JSON.parse(withoutTrailingCommas);
}

function stripComments(input: string): string {
	let result = "";
	let index = 0;
	let inString = false;
	let stringQuote = '"';

	while (index < input.length) {
		const current = input[index];
		const next = input[index + 1];

		if (inString) {
			result += current;
			if (current === "\\" && next) {
				result += next;
				index += 2;
				continue;
			}

			if (current === stringQuote) {
				inString = false;
			}

			index += 1;
			continue;
		}

		if (current === '"' || current === "'") {
			inString = true;
			stringQuote = current;
			result += current;
			index += 1;
			continue;
		}

		if (current === "/" && next === "/") {
			index += 2;
			while (index < input.length && input[index] !== "\n") {
				index += 1;
			}
			continue;
		}

		if (current === "/" && next === "*") {
			index += 2;
			while (index < input.length) {
				if (input[index] === "*" && input[index + 1] === "/") {
					index += 2;
					break;
				}
				index += 1;
			}
			continue;
		}

		result += current;
		index += 1;
	}

	return result;
}
