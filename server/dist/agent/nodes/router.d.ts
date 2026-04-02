import type { AgentState } from '../state';
export declare const createRouterNode: () => (state: AgentState) => Promise<Partial<AgentState>>;
export declare const shouldContinue: (state: AgentState) => string;
