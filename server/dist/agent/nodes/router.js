"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldContinue = exports.createRouterNode = void 0;
const createRouterNode = () => {
    return async (state) => {
        if (state.critique && !state.critique.is_adequate && state.retry_count < 2) {
            return { next_action: 'rewrite' };
        }
        return { next_action: state.next_action };
    };
};
exports.createRouterNode = createRouterNode;
const shouldContinue = (state) => {
    if (state.next_action === 'done') {
        return 'done';
    }
    return state.next_action;
};
exports.shouldContinue = shouldContinue;
//# sourceMappingURL=router.js.map