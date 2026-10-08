import { tool } from '@langchain/core/tools';
import { z } from 'zod';
// This factory has no network, mail transport, or database dependency.
export function createAgenticAcceptanceTools() {
  const search = tool(
    () => ({
      results: [
        {
          title: '合成现实背景',
          url: 'https://example.invalid/fixture',
          content: '这是受控测试工具生成的现实背景，不是小说事实。',
        },
      ],
    }),
    {
      name: 'tavily_search',
      description: '受控合成搜索',
      schema: z.object({ query: z.string() }).passthrough(),
    },
  );
  return {
    mcp: {
      getMcpTools: async () => [search],
      onModuleDestroy: async () => undefined,
    },
    mailer: {
      sendMail: async () => ({
        messageId: 'fixture-mail',
        accepted: [],
        rejected: [],
      }),
    },
  };
}
