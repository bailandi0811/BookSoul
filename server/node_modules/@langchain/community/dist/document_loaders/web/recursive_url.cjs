Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_async_caller = require("@langchain/core/utils/async_caller");
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let jsdom = require("jsdom");
let _langchain_core_utils_ssrf = require("@langchain/core/utils/ssrf");

//#region src/document_loaders/web/recursive_url.ts
var recursive_url_exports = /* @__PURE__ */ require_runtime.__exportAll({ RecursiveUrlLoader: () => RecursiveUrlLoader });
const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", () => {});
const MAX_REDIRECTS = 10;
const REDIRECT_CODES = new Set([
	301,
	302,
	303,
	307,
	308
]);
var RecursiveUrlLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	caller;
	url;
	excludeDirs;
	extractor;
	maxDepth;
	timeout;
	preventOutside;
	constructor(url, options) {
		super();
		this.caller = new _langchain_core_utils_async_caller.AsyncCaller({
			maxConcurrency: 64,
			maxRetries: 0,
			...options.callerOptions
		});
		this.url = url;
		this.excludeDirs = options.excludeDirs ?? [];
		this.extractor = options.extractor ?? ((s) => s);
		this.maxDepth = options.maxDepth ?? 2;
		this.timeout = options.timeout ?? 1e4;
		this.preventOutside = options.preventOutside ?? true;
	}
	async fetchWithTimeout(resource, options) {
		const { timeout, ...rest } = options;
		let currentUrl = resource;
		for (let i = 0; i <= MAX_REDIRECTS; i++) {
			(0, _langchain_core_utils_ssrf.validateSafeUrl)(currentUrl, { allowHttp: true });
			const response = await this.caller.call(() => fetch(currentUrl, {
				...rest,
				redirect: "manual",
				signal: AbortSignal.timeout(timeout)
			}));
			if (REDIRECT_CODES.has(response.status)) {
				const location = response.headers.get("location");
				if (!location) throw new Error("Redirect response missing Location header");
				currentUrl = new URL(location, currentUrl).href;
				continue;
			}
			return response;
		}
		throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
	}
	getChildLinks(html, baseUrl) {
		const allLinks = Array.from(new jsdom.JSDOM(html, { virtualConsole }).window.document.querySelectorAll("a")).map((a) => a.href);
		const absolutePaths = [];
		const invalidPrefixes = [
			"javascript:",
			"mailto:",
			"#"
		];
		const invalidSuffixes = [
			".css",
			".js",
			".ico",
			".png",
			".jpg",
			".jpeg",
			".gif",
			".svg"
		];
		for (const link of allLinks) {
			if (invalidPrefixes.some((prefix) => link.startsWith(prefix)) || invalidSuffixes.some((suffix) => link.endsWith(suffix))) continue;
			let standardizedLink;
			if (link.startsWith("http")) standardizedLink = link;
			else if (link.startsWith("//")) standardizedLink = new URL(baseUrl).protocol + link;
			else standardizedLink = new URL(link, baseUrl).href;
			if (this.excludeDirs.some((exDir) => standardizedLink.startsWith(exDir))) continue;
			if (link.startsWith("http")) {
				if (!this.preventOutside || (0, _langchain_core_utils_ssrf.isSameOrigin)(link, baseUrl)) absolutePaths.push(link);
			} else if (link.startsWith("//")) {
				const base = new URL(baseUrl);
				absolutePaths.push(base.protocol + link);
			} else {
				const newLink = new URL(link, baseUrl).href;
				absolutePaths.push(newLink);
			}
		}
		return Array.from(new Set(absolutePaths));
	}
	extractMetadata(rawHtml, url) {
		const metadata = { source: url };
		const { document } = new jsdom.JSDOM(rawHtml, { virtualConsole }).window;
		const title = document.getElementsByTagName("title")[0];
		if (title) metadata.title = title.textContent;
		const description = document.querySelector("meta[name=description]");
		if (description) metadata.description = description.getAttribute("content");
		const html = document.getElementsByTagName("html")[0];
		if (html) metadata.language = html.getAttribute("lang");
		return metadata;
	}
	async getUrlAsDoc(url) {
		let res;
		try {
			res = await this.fetchWithTimeout(url, { timeout: this.timeout });
			res = await res.text();
		} catch {
			return null;
		}
		return {
			pageContent: this.extractor(res),
			metadata: this.extractMetadata(res, url)
		};
	}
	async getChildUrlsRecursive(inputUrl, visited = /* @__PURE__ */ new Set(), depth = 0) {
		if (depth >= this.maxDepth) return [];
		let url = inputUrl;
		if (!inputUrl.endsWith("/")) url += "/";
		if (this.excludeDirs.some((exDir) => url.startsWith(exDir))) return [];
		let res;
		try {
			res = await this.fetchWithTimeout(url, { timeout: this.timeout });
			res = await res.text();
		} catch {
			return [];
		}
		const childUrls = this.getChildLinks(res, url);
		return (await Promise.all(childUrls.map((childUrl) => (async () => {
			if (visited.has(childUrl)) return null;
			visited.add(childUrl);
			const childDoc = await this.getUrlAsDoc(childUrl);
			if (!childDoc) return null;
			if (childUrl.endsWith("/")) return [childDoc, ...await this.getChildUrlsRecursive(childUrl, visited, depth + 1)];
			return [childDoc];
		})()))).flat().filter((docs) => docs !== null);
	}
	async load() {
		const rootDoc = await this.getUrlAsDoc(this.url);
		if (!rootDoc) return [];
		const docs = [rootDoc];
		docs.push(...await this.getChildUrlsRecursive(this.url, new Set([this.url])));
		return docs;
	}
};

//#endregion
exports.RecursiveUrlLoader = RecursiveUrlLoader;
Object.defineProperty(exports, 'recursive_url_exports', {
  enumerable: true,
  get: function () {
    return recursive_url_exports;
  }
});
//# sourceMappingURL=recursive_url.cjs.map