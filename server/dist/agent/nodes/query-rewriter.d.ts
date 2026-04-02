import { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';
export declare const createQueryRewriterNode: (model: ChatOpenAI) => (state: AgentState) => Promise<Partial<AgentState>>;
export { createCritiqueAgent } from './critique';
