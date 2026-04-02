import { ChatOpenAI } from '@langchain/openai';
import type { AgentState, CritiqueResult, RetrievalDoc } from '../state';
export declare const createCritiqueAgent: (model: ChatOpenAI) => (query: string, documents: RetrievalDoc[]) => Promise<CritiqueResult>;
export declare const createCritiqueNode: (model: ChatOpenAI) => (state: AgentState) => Promise<Partial<AgentState>>;
