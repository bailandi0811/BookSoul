import type { AgentState } from '../state';

export const createRouterNode = () => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    // 根据critique结果和retry_count决定下一步
    if (state.critique && !state.critique.is_adequate && state.retry_count < 2) {
      return { next_action: 'rewrite' as const };
    }

    // 否则按当前next_action继续
    return { next_action: state.next_action };
  };
};

export const shouldContinue = (state: AgentState): string => {
  if (state.next_action === 'done') {
    return 'done';
  }
  return state.next_action;
};
