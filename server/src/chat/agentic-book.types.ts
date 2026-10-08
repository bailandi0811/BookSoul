import type { RetrievedBookChunk } from './book-chunk-retriever.service';
import type { AgentMemoryContext } from '../memory/memory.service';
import type { ExternalResearchAgentResult } from './book-external-research-agent.service';
import type { PreparedEmailDraft } from './tools/prepare-email.tool';

export const AGENTIC_BOOK_LIMITS = Object.freeze({
  requestMs: 90000,
  modelMs: 30000,
  reserveMs: 30000,
  modelTurns: 4,
  toolCalls: 3,
  bookSearches: 3,
  queryTexts: 9,
  memoryRecalls: 2,
  chunks: 8,
  contextChars: 12000,
  perSection: 3,
  promptChars: 40000,
  outputTokens: 2400,
});
export type AgenticToolName =
  | 'book_search'
  | 'memory_recall'
  | 'request_external_research'
  | 'prepare_email';
export interface AgenticToolPermissions {
  externalResearch: boolean;
  emailDraft: boolean;
}
export interface AgenticToolResult {
  code:
    | 'OK'
    | 'NOT_FOUND'
    | 'INVALID_TOOL_ARGUMENTS'
    | 'MULTIPLE_TOOL_CALLS'
    | 'TOOL_UNAVAILABLE'
    | 'BUDGET_EXHAUSTED';
  book?: RetrievedBookChunk[];
  memory?: AgentMemoryContext;
  external?: ExternalResearchAgentResult;
  draft?: PreparedEmailDraft;
}
