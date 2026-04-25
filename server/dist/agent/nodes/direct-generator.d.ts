import { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';
export declare const createDirectGeneratorNode: (model: ChatOpenAI, getPersonaPrompt: (name: string) => string) => (state: AgentState) => Promise<Partial<AgentState> & {
    stream?: any;
}>;
