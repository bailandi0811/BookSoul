"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRetrieverNode = void 0;
const createRetrieverNode = (novelSearchTool, baseTopK = 3) => {
    return async (state) => {
        const currentQuery = state.rewritten_queries[state.current_query_index];
        if (!currentQuery) {
            return {
                next_action: 'critique',
            };
        }
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
                next_action: hasMore ? 'retrieve' : 'critique',
            };
        }
        catch (error) {
            return {
                retrieved_documents: [
                    ...state.retrieved_documents,
                    { query: currentQuery, docs: [] },
                ],
                current_query_index: state.current_query_index + 1,
                next_action: state.current_query_index < state.rewritten_queries.length - 1
                    ? 'retrieve'
                    : 'critique',
            };
        }
    };
};
exports.createRetrieverNode = createRetrieverNode;
//# sourceMappingURL=retriever.js.map