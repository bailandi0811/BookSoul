"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_STATE = exports.ROUTING_THRESHOLDS = exports.NODES = void 0;
exports.NODES = {
    CLASSIFY: 'classify',
    DIRECT_GENERATOR: 'directGenerator',
    QUERY_REWRITER: 'queryRewriter',
    RETRIEVER: 'retriever',
    CRITIQUE: 'critique',
    GENERATOR: 'generator',
    HYBRID_ROUTER: 'hybridRouter',
};
exports.ROUTING_THRESHOLDS = {
    DIRECT_GENERATE_MAX: 0.3,
    RAG_MIN: 0.7,
    HIGH_CONFIDENCE: 0.8,
    LOW_CONFIDENCE: 0.5,
};
exports.INITIAL_STATE = {
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
//# sourceMappingURL=state.js.map