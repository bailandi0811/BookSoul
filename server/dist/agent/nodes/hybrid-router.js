"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldContinue = exports.createHybridRouterNode = void 0;
const state_1 = require("../state");
const createHybridRouterNode = () => {
    return async (state) => {
        if (state.next_action === 'done') {
            return { next_action: 'done' };
        }
        if (state.critique) {
            const { is_adequate, confidence } = state.critique;
            const retryCount = state.retry_count;
            const maxRetries = state.max_retries;
            if (is_adequate || confidence >= state_1.ROUTING_THRESHOLDS.RAG_MIN || retryCount >= maxRetries) {
                return { next_action: 'generate' };
            }
            if (!is_adequate && retryCount < maxRetries) {
                return { next_action: 'rewrite' };
            }
        }
        const intent = state.intent_classification;
        if (intent) {
            if (intent.intent_type === 'simple_greeting' && intent.confidence >= state_1.ROUTING_THRESHOLDS.HIGH_CONFIDENCE) {
                return { next_action: 'direct_generate' };
            }
            if (intent.intent_type === 'complex_rag') {
                return { next_action: 'rewrite' };
            }
        }
        switch (state.next_action) {
            case 'rewrite':
                return { next_action: 'rewrite' };
            case 'retrieve':
                return { next_action: 'retrieve' };
            case 'critique':
                return { next_action: 'critique' };
            case 'generate':
                return { next_action: 'generate' };
            default:
                return { next_action: 'done' };
        }
    };
};
exports.createHybridRouterNode = createHybridRouterNode;
const shouldContinue = (state) => {
    if (state.next_action === 'done') {
        return 'done';
    }
    return state.next_action;
};
exports.shouldContinue = shouldContinue;
//# sourceMappingURL=hybrid-router.js.map