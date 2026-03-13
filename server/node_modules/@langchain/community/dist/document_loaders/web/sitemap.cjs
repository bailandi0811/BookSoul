Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_document_loaders_web_cheerio = require('./cheerio.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_utils_chunk_array = require("@langchain/core/utils/chunk_array");

//#region src/document_loaders/web/sitemap.ts
var sitemap_exports = /* @__PURE__ */ require_runtime.__exportAll({ SitemapLoader: () => SitemapLoader });
const DEFAULT_CHUNK_SIZE = 300;
var SitemapLoader = class extends require_document_loaders_web_cheerio.CheerioWebBaseLoader {
	allowUrlPatterns;
	chunkSize;
	constructor(webPath, params = {}) {
		const paramsWithDefaults = {
			chunkSize: DEFAULT_CHUNK_SIZE,
			...params
		};
		let path = webPath.endsWith("/") ? webPath.slice(0, -1) : webPath;
		path = path.endsWith(".xml") ? path : `${path}/sitemap.xml`;
		super(path, paramsWithDefaults);
		this.webPath = webPath;
		this.webPath = path;
		this.allowUrlPatterns = paramsWithDefaults.filterUrls;
		this.chunkSize = paramsWithDefaults.chunkSize;
	}
	_checkUrlPatterns(url) {
		if (!this.allowUrlPatterns) return false;
		return !this.allowUrlPatterns.some((pattern) => !new RegExp(pattern).test(url));
	}
	async parseSitemap() {
		const $ = await require_document_loaders_web_cheerio.CheerioWebBaseLoader._scrape(this.webPath, this.caller, this.timeout, this.textDecoder, {
			xmlMode: true,
			xml: true
		});
		const elements = [];
		$("url").each((_, element) => {
			const loc = $(element).find("loc").text();
			if (!loc) return;
			if (this._checkUrlPatterns(loc)) return;
			const changefreq = $(element).find("changefreq").text();
			const lastmod = $(element).find("lastmod").text();
			const priority = $(element).find("priority").text();
			elements.push({
				loc,
				changefreq,
				lastmod,
				priority
			});
		});
		$("sitemap").each((_, element) => {
			const loc = $(element).find("loc").text();
			if (!loc) return;
			const changefreq = $(element).find("changefreq").text();
			const lastmod = $(element).find("lastmod").text();
			const priority = $(element).find("priority").text();
			elements.push({
				loc,
				changefreq,
				lastmod,
				priority
			});
		});
		return elements;
	}
	async _loadSitemapUrls(elements) {
		return (await require_document_loaders_web_cheerio.CheerioWebBaseLoader.scrapeAll(elements.map((ele) => ele.loc), this.caller, this.timeout, this.textDecoder)).map(($, i) => {
			if (!elements[i]) throw new Error("Scraped docs and elements not in sync");
			const text = $(this.selector).text();
			const { loc: source, ...metadata } = elements[i];
			const description = $("meta[name='description']").attr("content");
			const title = $("meta[property='og:title']").attr("content");
			const lang = $("meta[property='og:locale']").attr("content");
			return new _langchain_core_documents.Document({
				pageContent: text,
				metadata: {
					...metadata,
					description,
					title,
					lang,
					source: source.trim()
				}
			});
		});
	}
	async load() {
		const chunks = (0, _langchain_core_utils_chunk_array.chunkArray)(await this.parseSitemap(), this.chunkSize);
		const documents = [];
		for await (const chunk of chunks) {
			const chunkedDocuments = await this._loadSitemapUrls(chunk);
			documents.push(...chunkedDocuments);
		}
		return documents;
	}
};

//#endregion
exports.SitemapLoader = SitemapLoader;
Object.defineProperty(exports, 'sitemap_exports', {
  enumerable: true,
  get: function () {
    return sitemap_exports;
  }
});
//# sourceMappingURL=sitemap.cjs.map