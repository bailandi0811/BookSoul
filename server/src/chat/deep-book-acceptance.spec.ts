import {
  parseDeepReadingSse,
  evaluateDeepReadingCase,
  summarizeDeepReadingRows,
  summarizeDeepReadingBaselines,
  readDeepReadingStream,
} from '../../test/deep-reading-evaluation';
describe('offline evidence evaluator', () => {
  it('requires one success terminal and a nonempty answer', () => {
    expect(parseDeepReadingSse('').success).toBe(false);
    expect(parseDeepReadingSse('data: {"thinking":"wait"}\n\n').success).toBe(
      false,
    );
    expect(
      parseDeepReadingSse('data: {"content":"answer"}\n\n').errorCode,
    ).toBe('INCOMPLETE_STREAM');
    expect(
      parseDeepReadingSse(
        'data: {"content":"answer"}\n\ndata: [DONE]\n\ndata: [DONE]\n\n',
      ).success,
    ).toBe(false);
    expect(
      parseDeepReadingSse('data: {"content":"answer"}\n\ndata: [DONE]\n\n')
        .success,
    ).toBe(true);
  });
  const fixture = {
    id: 'fixture',
    category: 'complex',
    split: 'acceptance',
    evidenceGroups: [['a', 'equivalent-a'], ['b']],
    expectedFacts: ['事实一'],
    forbiddenFacts: ['后文事实'],
  };
  it('requires all evidence groups and supports equivalent chunks', () => {
    const row = evaluateDeepReadingCase(fixture, {
      chunkIds: ['equivalent-a'],
      answer: '事实一',
      run: 1,
      baseline: 'B2',
    });
    expect(row.evidenceCoverage).toBe(0.5);
    expect(row.completeEvidence).toBe(false);
    expect(
      evaluateDeepReadingCase(fixture, {
        chunkIds: ['equivalent-a', 'b'],
        answer: '事实一',
        run: 1,
        baseline: 'B2',
      }).completeEvidence,
    ).toBe(true);
  });
  it('detects forbidden fixture facts and does not treat repeats as independent cases', () => {
    const rows = [1, 2, 3].map((run) =>
      evaluateDeepReadingCase(fixture, {
        chunkIds: ['a', 'b'],
        answer: '事实一 后文事实',
        run,
        baseline: 'B2',
      }),
    );
    const summary = summarizeDeepReadingRows(rows);
    expect(summary.caseCount).toBe(1);
    expect(summary.securityViolations).toBe(3);
    expect(summary.liveQualityVerified).toBe(false);
  });
  it('reports empty metrics as unavailable', () => {
    expect(summarizeDeepReadingRows([]).completeEvidenceRate).toBeNull();
  });
  it('times first content without counting heartbeat events', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100);
    try {
      const result = await readDeepReadingStream(
        new Response(
          'data: {"thinking":"wait"}\n\ndata: {"content":"answer"}\n\ndata: [DONE]\n\n',
        ),
        0,
      );
      expect(result.firstContentMs).toBe(100);
      expect(clock).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
  it('keeps draft/memory events and Q/D0/D1 summaries separate', () => {
    const parsed = parseDeepReadingSse(
      'data: {"content":"answer"}\n\ndata: {"emailDraft":{"to":"reader@example.invalid","subject":"合成","text":"内容"}}\n\ndata: {"memoryUpdate":{"hasNewMemories":true,"memoryCount":1}}\n\ndata: [DONE]\n\n',
    );
    expect(parsed.emailDraft).toBeDefined();
    expect(parsed.memoryUpdate).toMatchObject({ hasNewMemories: true });
    const rows = ['Q', 'D0', 'D1'].map((baseline) =>
      evaluateDeepReadingCase(fixture, {
        baseline,
        run: 1,
        chunkIds: [],
        answer: '',
      }),
    );
    expect(Object.keys(summarizeDeepReadingBaselines(rows))).toEqual([
      'Q',
      'D0',
      'D1',
    ]);
    expect(parseDeepReadingSse('data: broken\n\n').errorCode).toBe(
      'INVALID_STREAM_EVENT',
    );
  });
});
