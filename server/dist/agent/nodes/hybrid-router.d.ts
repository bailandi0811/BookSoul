import type { AgentState } from '../state';
export declare const createHybridRouterNode: () => (state: AgentState) => Promise<Partial<AgentState>>;
export declare const shouldContinue: (state: AgentState) => string;
