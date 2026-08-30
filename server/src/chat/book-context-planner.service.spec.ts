import { ConfigService } from '@nestjs/config';
import { BookContextPlannerService } from './book-context-planner.service';

describe('BookContextPlannerService', () => {
  let invoke: jest.Mock;
  let withStructuredOutput: jest.Mock;
  let planner: BookContextPlannerService;

  beforeEach(() => {
    invoke = jest.fn();
    withStructuredOutput = jest.fn().mockReturnValue({ invoke });
    planner = new BookContextPlannerService({
      get: jest.fn(),
    } as unknown as ConfigService);
    Object.assign(planner, { model: { withStructuredOutput } });
  });

  it('uses a deterministic no-context route for explicit small talk', async () => {
    const plan = await planner.plan(input('你好！'));

    expect(plan).toEqual(
      expect.objectContaining({
        intent: 'social',
        mode: 'none',
        plannerSource: 'rule',
        reasonCode: 'explicit_social',
        bookQueries: [],
        memoryPolicy: 'none',
        historyPolicy: 'none',
        conversationMessages: [],
      }),
    );
    expect(withStructuredOutput).not.toHaveBeenCalled();
  });

  it('uses direct focused RAG without a planner model call', async () => {
    const plan = await planner.plan(input('谁在夜里出现？'));

    expect(plan).toEqual(
      expect.objectContaining({
        intent: 'book_lookup',
        mode: 'focused',
        plannerSource: 'rule',
        bookQueries: ['谁在夜里出现？'],
        bookLimit: 4,
        maxBookContextChars: 3_600,
        maxChunksPerSection: 4,
        memoryPolicy: 'none',
      }),
    );
    expect(withStructuredOutput).not.toHaveBeenCalled();
  });

  it('uses structured planning to decompose broad analysis', async () => {
    invoke.mockResolvedValue({
      intent: 'book_analysis',
      retrievalQueries: ['乔峰面对身世的反应', '段誉面对身世的反应'],
      historyPolicy: 'recent',
      memoryPolicy: 'none',
      breadth: 'broad',
      reasonCode: 'comparison',
    });

    const plan = await planner.plan(
      input('比较乔峰和段誉面对身世问题时的反应'),
    );

    expect(plan).toEqual(
      expect.objectContaining({
        intent: 'book_analysis',
        mode: 'broad',
        plannerSource: 'llm',
        reasonCode: 'comparison',
        bookQueries: [
          '比较乔峰和段誉面对身世问题时的反应',
          '乔峰面对身世的反应',
          '段誉面对身世的反应',
        ],
        bookLimit: 8,
        maxBookContextChars: 7_200,
        maxChunksPerSection: 2,
      }),
    );
    expect(withStructuredOutput).toHaveBeenCalledTimes(1);
  });

  it('grounds an ambiguous follow-up in recent user questions only', async () => {
    invoke.mockResolvedValue({
      intent: 'follow_up',
      retrievalQueries: ['旧友交出信件的动机'],
      historyPolicy: 'follow_up',
      memoryPolicy: 'none',
      breadth: 'standard',
      reasonCode: 'ambiguous_follow_up',
    });

    const plan = await planner.plan({
      ...input('他为什么这么做？'),
      recentMessages: [
        { role: 'user', content: '旧友在客栈做了什么？' },
        { role: 'assistant', content: '不要把模型回答用于检索。' },
      ],
    });

    expect(plan.intent).toBe('follow_up');
    expect(plan.historyPolicy).toBe('follow_up');
    expect(plan.bookQueries).toEqual([
      '他为什么这么做？',
      '最近用户问题：旧友在客栈做了什么？ 当前追问：他为什么这么做？',
      '旧友交出信件的动机',
    ]);
    const plannerMessages = invoke.mock.calls[0][0] as Array<{
      content: string;
    }>;
    expect(plannerMessages.at(-1)?.content).toContain('旧友在客栈做了什么？');
    expect(plannerMessages.at(-1)?.content).not.toContain('模型回答');
  });

  it('falls back to deterministic RAG when structured planning fails', async () => {
    invoke.mockRejectedValue(new Error('planner unavailable'));

    const plan = await planner.plan(input('总结目前出现的所有伏笔'));

    expect(plan).toEqual(
      expect.objectContaining({
        mode: 'broad',
        plannerSource: 'fallback',
        reasonCode: 'planner_fallback',
        bookQueries: ['总结目前出现的所有伏笔'],
        bookLimit: 8,
      }),
    );
  });

  it('selects scoped memory only for personal context requests', async () => {
    const notes = await planner.plan(input('结合我的笔记分析这个人物'));
    const preferences = await planner.plan(input('按照我喜欢的简洁风格回答'));

    expect(notes).toEqual(
      expect.objectContaining({
        intent: 'personalized',
        memoryPolicy: 'book_notes',
        memoryLimit: 5,
      }),
    );
    expect(preferences).toEqual(
      expect.objectContaining({
        intent: 'personalized',
        memoryPolicy: 'preferences',
        memoryLimit: 3,
      }),
    );
  });

  function input(query: string) {
    return {
      bookTitle: '长夜行',
      query,
      recentMessages: [],
    };
  }
});
