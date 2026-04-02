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
    query: string;
    persona: string;
    rewritten_queries: string[];
    current_query_index: number;
    retrieved_documents: RetrievedDocument[];
    critique: CritiqueResult | null;
    retry_count: number;
    final_response: string;
    references: RetrievalDoc[];
    tool_calls: Array<{
        tool: string;
        args: any;
        result: any;
    }>;
    messages: BaseMessage[];
    next_action: 'rewrite' | 'retrieve' | 'critique' | 'generate' | 'done';
}
export declare const NODES: {
    readonly QUERY_REWRITER: "queryRewriter";
    readonly RETRIEVER: "retriever";
    readonly CRITIQUE: "critique";
    readonly GENERATOR: "generator";
    readonly ROUTER: "router";
};
export declare const INITIAL_STATE: Partial<AgentState>;
