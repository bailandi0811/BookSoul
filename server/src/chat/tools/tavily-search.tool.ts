import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ExternalSource } from '../external-research.service';

export const TAVILY_SEARCH_TOOL_NAME = 'tavily_search';

const TavilySearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(400)
      .describe(
        '用于查询现实世界资料的简洁搜索词。只能基于当前书名和用户当前问题生成，不得包含小说原文、用户记忆、历史消息或账号信息。',
      ),
  })
  .strict();

export type TavilySearchInput = z.infer<typeof TavilySearchInputSchema>;

export function parseTavilySearchInput(value: unknown): TavilySearchInput {
  return TavilySearchInputSchema.parse(value);
}

export function createTavilySearchTool(
  execute: (input: TavilySearchInput) => Promise<ExternalSource[]>,
) {
  return tool(execute, {
    name: TAVILY_SEARCH_TOOL_NAME,
    description:
      '搜索现实世界的最新或背景资料。仅当问题需要作者信息、历史文化典故、现实背景或时效性事实时调用。不得用它查询或补写小说人物、情节、设定、伏笔和结局；这些内容必须以当前可见原文为准。',
    schema: TavilySearchInputSchema,
  });
}
