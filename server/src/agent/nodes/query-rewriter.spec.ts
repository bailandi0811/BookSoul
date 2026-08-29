import type { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';
import { createQueryRewriterNode } from './query-rewriter';

function createState(intentType: 'needs_rag' | 'complex_rag'): AgentState {
  return {
    query: '乔峰在聚贤庄喝了几碗酒？',
    persona: 'assistant',
    conversation_context: '',
    memory_context: '',
    intent_classification: {
      intent_type: intentType,
      confidence: 0.9,
      reasoning: 'test',
      rag_likelihood: 0.9,
      suggested_action: 'rag_flow',
      keywords_matched: ['乔峰', '聚贤庄'],
      novel_entities_detected: ['乔峰', '聚贤庄'],
    },
    rewritten_queries: [],
    current_query_index: 0,
    retrieved_documents: [],
    critique: null,
    retry_count: 0,
    max_retries: 1,
    final_response: '',
    references: [],
    has_used_rag: false,
    messages: [],
    next_action: 'rewrite',
    tool_calls: [],
  };
}

describe('createQueryRewriterNode', () => {
  it('skips the LLM for an already usable entity query', async () => {
    const invoke = jest.fn();
    const node = createQueryRewriterNode({ invoke } as unknown as ChatOpenAI);

    const result = await node(createState('needs_rag'));

    expect(invoke).not.toHaveBeenCalled();
    expect(result.rewritten_queries).toEqual(['乔峰在聚贤庄喝了几碗酒？']);
    expect(result.next_action).toBe('retrieve');
  });

  it('falls back to the original query when complex rewriting fails', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('provider timeout'));
    const node = createQueryRewriterNode({ invoke } as unknown as ChatOpenAI);

    const result = await node(createState('complex_rag'));

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.rewritten_queries).toEqual(['乔峰在聚贤庄喝了几碗酒？']);
    expect(result.next_action).toBe('retrieve');
  });
});
