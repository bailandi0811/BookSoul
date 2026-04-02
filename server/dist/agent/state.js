"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_STATE = exports.NODES = void 0;
exports.NODES = {
    QUERY_REWRITER: 'queryRewriter',
    RETRIEVER: 'retriever',
    CRITIQUE: 'critique',
    GENERATOR: 'generator',
    ROUTER: 'router',
};
exports.INITIAL_STATE = {
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
//# sourceMappingURL=state.js.map