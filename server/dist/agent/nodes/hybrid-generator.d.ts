import { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';
import type { Tool } from '@langchain/core/tools';
export declare const createHybridGeneratorNode: (model: ChatOpenAI, tools: Tool[], getPersonaPrompt: (name: string) => string) => (state: AgentState) => Promise<Partial<AgentState> & {
    stream?: any;
}>;
