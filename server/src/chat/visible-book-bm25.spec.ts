import { scoreVisibleBook, fuseBookRanks } from './visible-book-bm25';

describe('visible book BM25', () => {
  it('uses all visible documents for IDF and length normalization', async () => {
    const groups = await scoreVisibleBook(
      [
        { id: 'a', content: 'sword' },
        { id: 'b', content: 'river' },
      ],
      ['sword'],
      4,
    );
    // N=2, df=1, tf=1, length=avgdl=1: BM25 = log(2).
    expect(groups[0]).toHaveLength(1);
    expect(groups[0][0].id).toBe('a');
    expect(groups[0][0].score).toBeCloseTo(Math.log(2));
  });

  it('retrieves rare Chinese names, Latin words and numbers', async () => {
    const groups = await scoreVisibleBook(
      [
        { id: 'a', content: '澹台烬持有 ZX17 信物。' },
        { id: 'b', content: '河边的旧友。' },
      ],
      ['澹台烬', 'zx17', '不存在'],
      4,
    );
    expect(groups.map((hits) => hits.map((hit) => hit.id))).toEqual([
      ['a'],
      ['a'],
      [],
    ]);
  });

  it('does not inflate scores for duplicated query terms', async () => {
    const groups = await scoreVisibleBook(
      [{ id: 'a', content: 'sword' }],
      ['sword', 'sword sword'],
      4,
    );
    expect(groups[0]).toEqual(groups[1]);
  });

  it('separates adjacent Han, Latin and numeric runs without whitespace', async () => {
    const groups = await scoreVisibleBook(
      [{ id: 'a', content: '在ZX17信物上刻有ABC澹台烬' }],
      ['zx17', 'ABC', '澹台烬'],
      4,
    );
    expect(groups.map((hits) => hits.map((hit) => hit.id))).toEqual([
      ['a'],
      ['a'],
      ['a'],
    ]);
  });

  it('honors cancellation instead of returning partial rankings', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      scoreVisibleBook(
        [{ id: 'a', content: 'sword' }],
        ['sword'],
        4,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('allows cancellation while tokenizing one long chunk', async () => {
    const controller = new AbortController();
    setImmediate(() => controller.abort());
    await expect(
      scoreVisibleBook(
        [{ id: 'a', content: '河边信物'.repeat(10000) }],
        ['信物'],
        4,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves dense ordering on ties and includes lexical-only evidence', () => {
    const result = fuseBookRanks(
      [
        { id: 'z', score: 0.9 },
        { id: 'a', score: 0.8 },
      ],
      [
        { id: 'a', score: 100 },
        { id: 'z', score: 1 },
        { id: 'lexical', score: 0.5 },
      ],
    );
    expect(result.map((hit) => hit.id)).toEqual(['z', 'a', 'lexical']);
    expect(
      fuseBookRanks(
        [
          { id: 'z', score: 0.9 },
          { id: 'a', score: 0.8 },
        ],
        [],
      ).map((hit) => hit.id),
    ).toEqual(['z', 'a']);
  });
});
