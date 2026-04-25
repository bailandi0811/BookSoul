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
export type IntentType = 'simple_greeting' | 'simple_fact' | 'general_knowledge' | 'needs_rag' | 'complex_rag' | 'unknown';
export interface IntentClassification {
    intent_type: IntentType;
    confidence: number;
    reasoning: string;
    rag_likelihood: number;
    suggested_action: 'direct_generate' | 'rag_flow' | 'hybrid';
    keywords_matched: string[];
    novel_entities_detected: string[];
}
export interface AgentState {
    query: string;
    persona: string;
    intent_classification: IntentClassification | null;
    rewritten_queries: string[];
    current_query_index: number;
    retrieved_documents: RetrievedDocument[];
    critique: CritiqueResult | null;
    retry_count: number;
    max_retries: number;
    final_response: string;
    references: RetrievalDoc[];
    has_used_rag: boolean;
    tool_calls: Array<{
        tool: string;
        args: any;
        result: any;
    }>;
    messages: BaseMessage[];
    next_action: 'classify' | 'direct_generate' | 'rewrite' | 'retrieve' | 'critique' | 'generate' | 'hybrid_generate' | 'done';
}
export declare const NODES: {
    readonly CLASSIFY: "classify";
    readonly DIRECT_GENERATOR: "directGenerator";
    readonly QUERY_REWRITER: "queryRewriter";
    readonly RETRIEVER: "retriever";
    readonly CRITIQUE: "critique";
    readonly GENERATOR: "generator";
    readonly HYBRID_ROUTER: "hybridRouter";
};
export declare const ROUTING_THRESHOLDS: {
    readonly DIRECT_GENERATE_MAX: 0.3;
    readonly RAG_MIN: 0.7;
    readonly HIGH_CONFIDENCE: 0.8;
    readonly LOW_CONFIDENCE: 0.5;
};
export declare const INITIAL_STATE: Partial<AgentState>;
