import type { Tool } from '@langchain/core/tools';
import type { AgentState } from '../state';
export declare const createRetrieverNode: (novelSearchTool: Tool, baseTopK?: number) => (state: AgentState) => Promise<Partial<AgentState>>;
