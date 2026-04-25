import { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';
export declare const createClassifyNode: (model: ChatOpenAI) => (state: AgentState) => Promise<Partial<AgentState>>;
