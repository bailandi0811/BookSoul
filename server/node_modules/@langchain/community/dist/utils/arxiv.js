import { PDFLoader } from "../document_loaders/fs/pdf.js";
import { Document } from "@langchain/core/documents";
import { XMLParser } from "fast-xml-parser";

//#region src/utils/arxiv.ts
function isArXivIdentifier(query) {
	return /^\d{4}\.\d{4,5}(v\d+)?$|^\d{7}(\.\d+)?(v\d+)?$/.test(query.trim());
}
async function fetchDirectArxivArticle(arxivIds) {
	try {
		const url = `http://export.arxiv.org/api/query?id_list=${arxivIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean).join(",")}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		const xml = await response.text();
		let entries = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_"
		}).parse(xml).feed.entry;
		if (!entries) return [];
		if (!Array.isArray(entries)) entries = [entries];
		return entries.map(processEntry);
	} catch {
		throw new Error(`Failed to fetch articles with IDs ${arxivIds}`);
	}
}
async function fetchArxivResultsByQuery(query, start = 0, maxResults = 10) {
	try {
		const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=${start}&max_results=${maxResults}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		const xml = await response.text();
		let entries = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_"
		}).parse(xml).feed.entry;
		if (!entries) return [];
		if (!Array.isArray(entries)) entries = [entries];
		return entries.map(processEntry);
	} catch {
		throw new Error(`Failed to fetch articles with query "${query}"`);
	}
}
async function searchArxiv(query, maxResults = 3) {
	if (isArXivIdentifier(query)) return await fetchDirectArxivArticle(query);
	else return await fetchArxivResultsByQuery(query, 0, maxResults);
}
async function fetchAndParsePDF(pdfUrl) {
	try {
		const response = await fetch(pdfUrl);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		const buffer = await response.arrayBuffer();
		return (await new PDFLoader(new Blob([buffer], { type: "application/pdf" }), { splitPages: false }).load()).map((doc) => doc.pageContent).join("\n\n");
	} catch {
		throw new Error(`Failed to fetch or parse PDF from ${pdfUrl}`);
	}
}
async function loadDocsFromResults(results) {
	const docs = [];
	for (const result of results) {
		const pdfUrl = result.pdfUrl;
		try {
			const doc = new Document({
				pageContent: await fetchAndParsePDF(pdfUrl),
				metadata: {
					id: result.id,
					title: result.title,
					authors: result.authors,
					published: result.published,
					updated: result.updated,
					source: "arxiv",
					url: result.id,
					summary: result.summary
				}
			});
			docs.push(doc);
		} catch {
			throw new Error(`Error loading document from ${pdfUrl}`);
		}
	}
	return docs;
}
function getDocsFromSummaries(results) {
	const docs = [];
	for (const result of results) {
		const metadata = {
			id: result.id,
			title: result.title,
			authors: result.authors,
			published: result.published,
			updated: result.updated,
			source: "arxiv",
			url: result.id
		};
		const doc = new Document({
			pageContent: result.summary,
			metadata
		});
		docs.push(doc);
	}
	return docs;
}
function processEntry(entry) {
	const id = entry.id;
	const title = entry.title.replace(/\s+/g, " ").trim();
	const summary = entry.summary.replace(/\s+/g, " ").trim();
	const published = entry.published;
	const updated = entry.updated;
	let authors = [];
	if (Array.isArray(entry.author)) authors = entry.author.map((author) => author.name);
	else if (entry.author) authors = [entry.author.name];
	let links = [];
	if (Array.isArray(entry.link)) links = entry.link;
	else if (entry.link) links = [entry.link];
	let pdfUrl = `${id.replace("/abs/", "/pdf/")}.pdf`;
	const pdfLinkObj = links.find((link) => link["@_title"] === "pdf");
	if (pdfLinkObj && pdfLinkObj["@_href"]) pdfUrl = pdfLinkObj["@_href"];
	return {
		id,
		title,
		summary,
		published,
		updated,
		authors,
		pdfUrl,
		links
	};
}

//#endregion
export { getDocsFromSummaries, loadDocsFromResults, searchArxiv };
//# sourceMappingURL=arxiv.js.map