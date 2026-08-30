import type { AgentState } from '../state';
import { ROUTING_THRESHOLDS } from '../state';

export const createHybridRouterNode = () => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    // 1. 检查是否完成
    if (state.next_action === 'done') {
      return { next_action: 'done' };
    }

    // 2. 根据critique结果和intent决定下一步
    if (state.critique) {
      const { is_adequate, confidence } = state.critique;
      const retryCount = state.retry_count;
      const maxRetries = state.max_retries;

      // 如果检索足够，或达到最大重试次数 → 生成
      if (
        is_adequate ||
        confidence >= ROUTING_THRESHOLDS.RAG_MIN ||
        retryCount >= maxRetries
      ) {
        return { next_action: 'generate' };
      }

      // 如果检索不足且还有重试机会 → 重新检索
      if (!is_adequate && retryCount < maxRetries) {
        return { next_action: 'rewrite' };
      }
    }

    // 3. 基于intent类型决定默认路径
    const intent = state.intent_classification;
    if (intent) {
      // 简单问题置信度很高 → 直接生成
      if (
        intent.intent_type === 'simple_greeting' &&
        intent.confidence >= ROUTING_THRESHOLDS.HIGH_CONFIDENCE
      ) {
        return { next_action: 'direct_generate' };
      }

      // 复杂RAG → 继续RAG流程
      if (intent.intent_type === 'complex_rag') {
        return { next_action: 'rewrite' };
      }
    }

    // 4. 默认：根据当前状态决定
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

export const shouldContinue = (state: AgentState): string => {
  if (state.next_action === 'done') {
    return 'done';
  }
  return state.next_action;
};
