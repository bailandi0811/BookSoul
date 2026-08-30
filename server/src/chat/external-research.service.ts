import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpService } from '../mcp/mcp.service';

const TAVILY_SEARCH_TOOL = 'tavily_search';
const MAX_QUERY_CHARS = 400;
const MAX_TOOL_OUTPUT_CHARS = 200_000;
const MAX_SOURCE_TITLE_CHARS = 240;
const MAX_SOURCE_SNIPPET_CHARS = 1_200;
const MAX_SOURCES = 5;

const TavilyPayloadSchema = z
  .object({
    results: z.array(z.unknown()),
  })
  .passthrough();

const TavilyResultSchema = z
  .object({
    title: z.string().nullish(),
    url: z.string(),
    content: z.string().nullish(),
    raw_content: z.string().nullish(),
  })
  .passthrough();

export interface ExternalSource {
  title: string;
  url: string;
  snippet: string;
}

@Injectable()
export class ExternalResearchService {
  constructor(private readonly mcp: McpService) {}

  async search(
    query: string,
    abortSignal?: AbortSignal,
  ): Promise<ExternalSource[]> {
    const normalizedQuery = query
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, MAX_QUERY_CHARS);
    if (!normalizedQuery) return [];

    this.throwIfAborted(abortSignal);
    const tools = await this.mcp.getMcpTools();
    this.throwIfAborted(abortSignal);
    const searchTool = tools.find((tool) => tool.name === TAVILY_SEARCH_TOOL);
    if (!searchTool) {
      const error = new Error('External search tool is unavailable');
      error.name = 'ExternalResearchUnavailableError';
      throw error;
    }

    const rawResult: unknown = await searchTool.invoke(
      {
        query: normalizedQuery,
        search_depth: 'basic',
        max_results: MAX_SOURCES,
        include_images: false,
        include_raw_content: false,
      },
      { signal: abortSignal },
    );
    this.throwIfAborted(abortSignal);
    return this.normalizeSources(rawResult);
  }

  private normalizeSources(rawResult: unknown): ExternalSource[] {
    const payload = TavilyPayloadSchema.parse(this.parseToolPayload(rawResult));
    const sources: ExternalSource[] = [];
    const seenUrls = new Set<string>();

    for (const candidate of payload.results) {
      const parsed = TavilyResultSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const url = this.safeHttpUrl(parsed.data.url);
      if (!url || seenUrls.has(url)) continue;
      const snippet = this.compact(
        parsed.data.content || parsed.data.raw_content || '',
        MAX_SOURCE_SNIPPET_CHARS,
      );
      if (!snippet) continue;
      const title =
        this.compact(parsed.data.title || '', MAX_SOURCE_TITLE_CHARS) ||
        new URL(url).hostname;
      sources.push({ title, url, snippet });
      seenUrls.add(url);
      if (sources.length >= MAX_SOURCES) break;
    }

    return sources;
  }

  private parseToolPayload(rawResult: unknown): unknown {
    if (rawResult && typeof rawResult === 'object') {
      if ('results' in rawResult) return rawResult;
      if ('structuredContent' in rawResult) {
        const structuredContent = rawResult.structuredContent;
        if (
          structuredContent &&
          typeof structuredContent === 'object' &&
          'results' in structuredContent
        ) {
          return structuredContent;
        }
      }
    }

    const text = this.extractText(rawResult).trim();
    if (!text || text.length > MAX_TOOL_OUTPUT_CHARS) {
      throw new Error('External search returned an invalid payload');
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      const results = this.parseFormattedResults(text);
      if (results !== null) return { results };
      throw new Error('External search returned an invalid payload');
    }
  }

  private parseFormattedResults(
    text: string,
  ): Array<{ title: string; url: string; content: string }> | null {
    const marker = 'Detailed Results:';
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) return null;

    const body = text.slice(markerIndex + marker.length).trim();
    if (!body) return [];

    const sections = body.split(/\r?\n\r?\n(?=Title:\s)/u);
    const results: Array<{ title: string; url: string; content: string }> = [];

    for (const section of sections) {
      const titleMatch = /^Title:\s*(.+)$/mu.exec(section);
      const urlMatch = /^URL:\s*(\S+)$/mu.exec(section);
      const contentMatch = /^Content:\s*/mu.exec(section);
      if (!titleMatch || !urlMatch || !contentMatch) continue;

      const contentStart = contentMatch.index + contentMatch[0].length;
      const trailingField = /\r?\n(?:Raw Content|Favicon):\s*/gu;
      trailingField.lastIndex = contentStart;
      const trailingMatch = trailingField.exec(section);
      const contentEnd = trailingMatch?.index ?? section.length;

      results.push({
        title: titleMatch[1],
        url: urlMatch[1],
        content: section.slice(contentStart, contentEnd),
      });
      if (results.length >= MAX_SOURCES) break;
    }

    if (results.length === 0) {
      throw new Error('External search returned malformed formatted results');
    }
    return results;
  }

  private extractText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.extractText(item)).join('');
    }
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if ('content' in record) return this.extractText(record.content);
    return '';
  }

  private safeHttpUrl(value: string): string | null {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  private compact(value: string, maxChars: number): string {
    const normalized = value.replace(/\s+/gu, ' ').trim();
    return normalized.length <= maxChars
      ? normalized
      : `${normalized.slice(0, maxChars - 1)}…`;
  }

  private throwIfAborted(abortSignal?: AbortSignal): void {
    if (!abortSignal?.aborted) return;
    const error = new Error('Aborted');
    error.name = 'AbortError';
    throw error;
  }
}
