import { TarotStateService } from './tarot-state.service';

describe('tarot owner-scoped state', () => {
  let state: TarotStateService;
  const fixed = {
    mode: 'fixed' as const,
    spread: 'three_card' as const,
    reason: null,
  };
  const make = (
    owner = 'reader-a',
    spread: 'three_card' | 'yes_no' = 'three_card',
  ) => {
    const permit = state.createPermit(owner, '脱敏问题', { ...fixed, spread });
    return { permit, round: state.draw(owner, permit, spread) };
  };
  beforeEach(() => {
    jest.useFakeTimers();
    state = new TarotStateService();
  });
  afterEach(() => {
    state.onModuleDestroy();
    jest.useRealTimers();
  });

  it('keeps a full unique deck private and returns the same round on draw retries', () => {
    const { permit, round } = make();
    expect(Object.keys(round).sort()).toEqual([
      'cardCount',
      'expiresAt',
      'readingId',
      'spread',
    ]);
    expect(state.draw('reader-a', permit, 'three_card')).toEqual(round);
    expect(() => state.draw('reader-a', permit, 'yes_no')).toThrow(
      'TAROT_SPREAD_LOCKED',
    );
    expect(state.getRound('reader-a', round.readingId).cards).toHaveLength(78);
    expect(
      new Set(
        state.getRound('reader-a', round.readingId).cards.map((c) => c.id),
      ).size,
    ).toBe(78);
  });

  it('rejects cross-owner permits and rounds before revealing or reading', () => {
    const { permit, round } = make();
    expect(() => state.draw('reader-b', permit, 'three_card')).toThrow(
      'TAROT_PERMIT_INVALID',
    );
    expect(() => state.reveal('reader-b', round.readingId, 0)).toThrow(
      'TAROT_DRAW_INVALID',
    );
    expect(() => state.getReading('reader-b', round.readingId)).toThrow(
      'TAROT_DRAW_INVALID',
    );
  });
  it.each(['yes_no', 'three_card'] as const)(
    'passes the authoritative %s spread and reveal order to reading',
    (spread) => {
      const { round } = make('reader-a', spread);
      const indices = spread === 'yes_no' ? [27] : [27, 4, 65];
      const cards = indices.map(
        (index) => state.reveal('reader-a', round.readingId, index).card,
      );
      expect(state.getReading('reader-a', round.readingId)).toEqual({
        question: '脱敏问题',
        spread,
        cards,
      });
    },
  );

  it('does not reset authority when the initial ID is replayed', () => {
    const { round } = make();
    expect(() => state.getReading('reader-a', round.readingId)).toThrow(
      'TAROT_READING_INCOMPLETE',
    );
    for (const [index, position] of [
      [4, 'past'],
      [30, 'present'],
      [77, 'future'],
    ] as const) {
      expect(
        state.reveal('reader-a', round.readingId, index).card.position,
      ).toBe(position);
    }
    expect(() => state.reveal('reader-a', round.readingId, 0)).toThrow(
      'TAROT_REVEAL_COMPLETE',
    );
    const repeated = state.reveal('reader-a', round.readingId, 30);
    expect(repeated.revealedCount).toBe(3);
    expect(repeated.card.position).toBe('present');
    expect(state.getReading('reader-a', round.readingId).question).toBe(
      '脱敏问题',
    );
  });

  it('accepts only one new card when concurrent callers reach the last slot', async () => {
    const { round } = make();
    state.reveal('reader-a', round.readingId, 0);
    state.reveal('reader-a', round.readingId, 1);
    const results = await Promise.allSettled(
      [2, 3].map((index) =>
        Promise.resolve().then(() =>
          state.reveal('reader-a', round.readingId, index),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      state
        .getReading('reader-a', round.readingId)
        .cards.map((c) => c.position),
    ).toEqual(['past', 'present', 'future']);
  });

  it('keeps duplicate reveals idempotent and yes/no limited to one', async () => {
    const { round } = make('reader-a', 'yes_no');
    const results = await Promise.all(
      [0, 0].map((index) =>
        Promise.resolve().then(() =>
          state.reveal('reader-a', round.readingId, index),
        ),
      ),
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[0].card.position).toBe('answer');
    expect(() => state.reveal('reader-a', round.readingId, 1)).toThrow(
      'TAROT_REVEAL_COMPLETE',
    );
    expect(() => state.reveal('reader-a', round.readingId, 0.5)).toThrow(
      'TAROT_DRAW_INVALID',
    );
  });

  it('expires the permit before the round and does not extend the round on retries', () => {
    const { permit, round } = make();
    jest.advanceTimersByTime(10 * 60_000);
    expect(() => state.draw('reader-a', permit, 'three_card')).toThrow(
      'TAROT_PERMIT_INVALID',
    );
    state.reveal('reader-a', round.readingId, 0);
    jest.advanceTimersByTime(20 * 60_000);
    expect(() => state.reveal('reader-a', round.readingId, 1)).toThrow(
      'TAROT_DRAW_INVALID',
    );
  });

  it('revokes old state and cancels old runs without releasing their occupancy early', () => {
    const { round } = make();
    const old = state.beginRun('reader-a', 'classification');
    state.invalidate('reader-a');
    expect(old.signal.aborted).toBe(true);
    expect(() => state.beginRun('reader-a', 'classification')).toThrow(
      'TAROT_CONCURRENCY_LIMITED',
    );
    expect(() => state.getRound('reader-a', round.readingId)).toThrow(
      'TAROT_DRAW_INVALID',
    );
    old.release();
    const current = state.beginRun('reader-a', 'classification');
    old.release();
    expect(() => state.beginRun('reader-a', 'classification')).toThrow(
      'TAROT_CONCURRENCY_LIMITED',
    );
    current.release();
  });

  it('rejects a simultaneous reading but permits retry after release', () => {
    const { round } = make('reader-a', 'yes_no');
    state.reveal('reader-a', round.readingId, 0);
    const run = state.beginRun('reader-a', 'reading', round.readingId);
    expect(() =>
      state.beginRun('reader-a', 'reading', round.readingId),
    ).toThrow('TAROT_READING_BUSY');
    run.release();
    state.beginRun('reader-a', 'reading', round.readingId).release();
  });

  it('enforces sliding rates and frees expired capacity', () => {
    for (let i = 0; i < 10; i++) state.count('reader-a', 'classification');
    expect(() => state.count('reader-a', 'classification')).toThrow(
      'TAROT_RATE_LIMITED',
    );
    jest.advanceTimersByTime(10 * 60_000);
    state.count('reader-a', 'classification');
    for (let i = 0; i < 1000; i++)
      state.createPermit(`reader-${i}`, '测试', fixed);
    expect(() => state.createPermit('overflow', '测试', fixed)).toThrow(
      'TAROT_CAPACITY_EXCEEDED',
    );
    jest.advanceTimersByTime(10 * 60_000);
    state.createPermit('overflow', '测试', fixed);
  });

  it('enforces global concurrency and aborts all runs on shutdown', () => {
    const runs = Array.from({ length: 20 }, (_, i) =>
      state.beginRun(`reader-${i}`, 'classification'),
    );
    expect(() => state.beginRun('overflow', 'classification')).toThrow(
      'TAROT_CONCURRENCY_LIMITED',
    );
    state.onModuleDestroy();
    expect(runs.every((run) => run.signal.aborted)).toBe(true);
  });
});
