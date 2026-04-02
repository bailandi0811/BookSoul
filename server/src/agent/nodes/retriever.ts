import type { Tool } from '@langchain/core/tools';
import type { AgentState } from '../state';

export const createRetrieverNode = (novelSearchTool: Tool, baseTopK = 3) => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const currentQuery = state.rewritten_queries[state.current_query_index];

    if (!currentQuery) {
      return {
        next_action: 'critique' as const,
      };
    }

    // 动态决定top_k：如果有多个子问题，增加k值
    const topK = state.rewritten_queries.length > 1
      ? Math.min(6, baseTopK + state.rewritten_queries.length)
      : baseTopK;

    try {
      const result = await novelSearchTool.invoke({
        query: currentQuery,
        top_k: topK,
      });

      const docs = JSON.parse(result);
      const newRetrievedDocs = [
        ...state.retrieved_documents,
        { query: currentQuery, docs: Array.isArray(docs) ? docs : [] },
      ];

      const hasMore = state.current_query_index < state.rewritten_queries.length - 1;

      return {
        retrieved_documents: newRetrievedDocs,
        current_query_index: hasMore
          ? state.current_query_index + 1
          : state.current_query_index,
        next_action: hasMore ? 'retrieve' as const : 'critique' as const,
      };
    } catch (error: any) {
      return {
        retrieved_documents: [
          ...state.retrieved_documents,
          { query: currentQuery, docs: [] },
        ],
        current_query_index: state.current_query_index + 1,
        next_action: state.current_query_index < state.rewritten_queries.length - 1
          ? 'retrieve' as const
          : 'critique' as const,
      };
    }
  };
};
