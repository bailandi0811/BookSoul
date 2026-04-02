import { BaseMessage } from '@langchain/core/messages';

export interface CritiqueResult {
  is_adequate: boolean;
  confidence: number;
  missing_aspects: string[];
  suggested_rewrite: string;
  reasoning: string;
}

export interface RetrievalDoc {
  book_name: string;
  chapter_num: number;
  content: string;
  score?: number;
}

export interface RetrievedDocument {
  query: string;
  docs: RetrievalDoc[];
}

export interface AgentState {
  // 输入
  query: string;
  persona: string;

  // 中间状态
  rewritten_queries: string[];
  current_query_index: number;
  retrieved_documents: RetrievedDocument[];
  critique: CritiqueResult | null;
  retry_count: number;

  // 输出
  final_response: string;
  references: RetrievalDoc[];

  // 工具调用历史
  tool_calls: Array<{
    tool: string;
    args: any;
    result: any;
  }>;

  // 对话历史（用于Generator）
  messages: BaseMessage[];

  // 控制流
  next_action: 'rewrite' | 'retrieve' | 'critique' | 'generate' | 'done';
}

export const NODES = {
  QUERY_REWRITER: 'queryRewriter',
  RETRIEVER: 'retriever',
  CRITIQUE: 'critique',
  GENERATOR: 'generator',
  ROUTER: 'router',
} as const;

export const INITIAL_STATE: Partial<AgentState> = {
  rewritten_queries: [],
  current_query_index: 0,
  retrieved_documents: [],
  critique: null,
  retry_count: 0,
  final_response: '',
  references: [],
  tool_calls: [],
  messages: [],
  next_action: 'rewrite',
};
