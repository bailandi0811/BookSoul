import { ServiceUnavailableException } from '@nestjs/common';
import { setImmediate } from 'node:timers/promises';

interface Hit {
  id: string;
  score: number;
}

// This profile uses Han bigrams rather than a dictionary, retaining rare names.
// It is a lexical retrieval baseline, not exact phrase matching or Jieba.
export const BOOK_BM25_PROFILE = 'visible-han-bigram-latin-v1';
export const BOOK_CORPUS_MAX_CHUNKS = 10_000;
export const BOOK_CORPUS_MAX_BYTES = 16 * 1024 * 1024;

export function assertBookRetrievalActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    throw error;
  }
}

function* terms(content: string): Generator<string> {
  for (const match of content
    .normalize('NFKC')
    .toLowerCase()
    .matchAll(/[\p{Script=Han}]+|(?:(?!\p{Script=Han})[\p{L}\p{N}])+/gu)) {
    const word = match[0];
    if (/^\p{Script=Han}/u.test(word)) {
      const characters = [...word];
      if (characters.length === 1) yield word;
      else
        for (let index = 0; index < characters.length - 1; index++)
          yield characters[index] + characters[index + 1];
    } else yield word;
  }
}

export async function scoreVisibleBook(
  corpus: ReadonlyArray<{ id: string; content: string }>,
  queries: readonly string[],
  limit: number,
  signal?: AbortSignal,
): Promise<Hit[][]> {
  assertBookRetrievalActive(signal);
  const startedAt = performance.now();
  const queryTerms = queries.map((query) => new Set(terms(query)));
  const wanted = new Set(queryTerms.flatMap((query) => [...query]));
  const frequencies = new Map<string, number>();
  const documents: Array<{
    id: string;
    length: number;
    counts: Map<string, number>;
  }> = [];
  let totalLength = 0;
  let totalBytes = 0;
  for (const chunk of corpus) {
    assertBookRetrievalActive(signal);
    totalBytes += Buffer.byteLength(chunk.content, 'utf8');
    if (
      documents.length >= BOOK_CORPUS_MAX_CHUNKS ||
      totalBytes > BOOK_CORPUS_MAX_BYTES ||
      performance.now() - startedAt > 5_000
    ) {
      throw new ServiceUnavailableException(
        '当前可见正文超出词法检索预算，请缩小讨论范围',
      );
    }
    const counts = new Map<string, number>();
    let length = 0;
    for (const term of terms(chunk.content)) {
      length++;
      if (wanted.has(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
      if (length % 4096 === 0) {
        await setImmediate();
        assertBookRetrievalActive(signal);
        if (performance.now() - startedAt > 5_000)
          throw new ServiceUnavailableException('词法检索超时，请稍后重试');
      }
    }
    for (const term of counts.keys())
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    totalLength += length;
    documents.push({ id: chunk.id, length, counts });
    if (documents.length % 64 === 0) await setImmediate();
  }
  const averageLength = totalLength / documents.length || 1;
  const result: Hit[][] = [];
  for (const query of queryTerms) {
    const hits: Hit[] = [];
    for (let index = 0; index < documents.length; index++) {
      assertBookRetrievalActive(signal);
      if (performance.now() - startedAt > 5_000)
        throw new ServiceUnavailableException('词法检索超时，请稍后重试');
      const document = documents[index];
      let score = 0;
      for (const term of query) {
        const tf = document.counts.get(term) ?? 0;
        if (!tf) continue;
        const df = frequencies.get(term)!;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        score +=
          (idf * (tf * 2.2)) /
          (tf + 1.2 * (0.25 + (0.75 * document.length) / averageLength));
      }
      if (score > 0) hits.push({ id: document.id, score });
      if (index % 256 === 255) await setImmediate();
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    result.push(hits.slice(0, limit));
  }
  assertBookRetrievalActive(signal);
  return result;
}

// RRF is an initial policy, not a measured quality claim. Preserve the current
// dense ranking on ties, without mixing raw cosine and BM25 score scales.
export function fuseBookRanks(
  dense: readonly Hit[],
  lexical: readonly Hit[],
): Hit[] {
  if (!lexical.length) return [...dense];
  const ranks = new Map<
    string,
    { score: number; denseRank: number; lexicalRank: number }
  >();
  for (const [channel, hits] of [dense, lexical].entries()) {
    const seen = new Set<string>();
    hits.forEach((hit, rank) => {
      if (seen.has(hit.id)) return;
      seen.add(hit.id);
      const existing = ranks.get(hit.id) ?? {
        score: 0,
        denseRank: Infinity,
        lexicalRank: Infinity,
      };
      existing.score += 1 / (60 + rank + 1);
      if (channel === 0) existing.denseRank = rank;
      else existing.lexicalRank = rank;
      ranks.set(hit.id, existing);
    });
  }
  return [...ranks]
    .sort(
      (a, b) =>
        b[1].score - a[1].score ||
        a[1].denseRank - b[1].denseRank ||
        a[1].lexicalRank - b[1].lexicalRank ||
        a[0].localeCompare(b[0]),
    )
    .map(([id, entry]) => ({ id, score: entry.score }));
}
