import { BaseMessage } from '@langchain/core/messages';

// ========== Core Types ==========

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

// ========== Intent Classification Types ==========

export type IntentType =
  | 'simple_greeting'      // 寒暄：你好、嗨、hi等
  | 'simple_fact'           // 简单事实：可直接从小说文本推断
  | 'general_knowledge'    // 通用知识：LLM自身知识能回答
  | 'needs_rag'             // 需要RAG：涉及具体小说内容
  | 'complex_rag'           // 复杂RAG：多跳推理、比较等
  | 'unknown';              // 未知：需要进一步分析

export interface IntentClassification {
  intent_type: IntentType;
  confidence: number;           // 0.0 - 1.0
  reasoning: string;             // 分类理由
  rag_likelihood: number;       // 需要RAG的概率 0.0 - 1.0
  suggested_action: 'direct_generate' | 'rag_flow' | 'hybrid';
  keywords_matched: string[];    // 匹配的关键词
  novel_entities_detected: string[]; // 检测到的小说实体
}

// ========== Enhanced Agent State ==========

export interface AgentState {
  // 输入
  query: string;
  persona: string;

  // 意图分析结果 (NEW)
  intent_classification: IntentClassification | null;

  // RAG 相关
  rewritten_queries: string[];
  current_query_index: number;
  retrieved_documents: RetrievedDocument[];
  critique: CritiqueResult | null;
  retry_count: number;
  max_retries: number;

  // 生成结果
  final_response: string;
  references: RetrievalDoc[];
  has_used_rag: boolean;         // 是否使用了RAG (NEW)

  // 工具调用历史
  tool_calls: Array<{
    tool: string;
    args: any;
    result: any;
  }>;

  // 对话历史
  messages: BaseMessage[];

  // 控制流 (EXTENDED)
  next_action:
    | 'classify'           // 新增：意图分类
    | 'direct_generate'    // 新增：直接生成
    | 'rewrite'            // 重写查询
    | 'retrieve'           // 检索
    | 'critique'           // 评估
    | 'generate'            // 生成
    | 'hybrid_generate'    // 新增：混合生成
    | 'done';              // 完成
}

// ========== Node Names ==========

export const NODES = {
  CLASSIFY: 'classify',
  DIRECT_GENERATOR: 'directGenerator',
  QUERY_REWRITER: 'queryRewriter',
  RETRIEVER: 'retriever',
  CRITIQUE: 'critique',
  GENERATOR: 'generator',
  HYBRID_ROUTER: 'hybridRouter',
} as const;

// ========== Routing Constants ==========

export const ROUTING_THRESHOLDS = {
  // RAG概率低于此值 → 直接生成
  DIRECT_GENERATE_MAX: 0.3,
  // RAG概率高于此值 → 完整RAG流程
  RAG_MIN: 0.7,
  // confidence阈值
  HIGH_CONFIDENCE: 0.8,
  LOW_CONFIDENCE: 0.5,
} as const;

// ========== Initial State ==========

export const INITIAL_STATE: Partial<AgentState> = {
  intent_classification: null,
  rewritten_queries: [],
  current_query_index: 0,
  retrieved_documents: [],
  critique: null,
  retry_count: 0,
  max_retries: 2,
  final_response: '',
  references: [],
  has_used_rag: false,
  tool_calls: [],
  messages: [],
  next_action: 'classify',
};