import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MilvusService } from '../../milvus/milvus.service';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MetricType } from '@zilliz/milvus2-sdk-node';

export const createNovelSearchTool = (
  milvusService: MilvusService,
  configService: ConfigService,
  embeddings: OpenAIEmbeddings,
) => {
  return tool(
    async ({ query, top_k = 3 }: { query: string; top_k?: number }) => {
      try {
        // 1. Get embedding for query
        const queryVector = await embeddings.embedQuery(query);

        // 2. Search Milvus with dynamic k
        const searchResult = await milvusService.getClient().search({
          collection_name:
            configService.get<string>('milvus.collectionName') || 'ebook',
          vector: queryVector,
          limit: top_k,
          metric_type: MetricType.COSINE,
          output_fields: ['content', 'chapter_num', 'book_name'],
        });

        return JSON.stringify(searchResult.results, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message, results: [] });
      }
    },
    {
      name: 'novel_search',
      description: `搜索《天龙八部》小说数据库中的相关片段。
当用户询问关于小说情节、人物、武功、地点等问题时使用。
- query: 搜索查询（应简洁明了）
- top_k: 返回结果数量（默认3，复杂问题可增加到5-10）`,
      schema: z.object({
        query: z.string().describe('搜索查询，描述要查找的小说内容'),
        top_k: z
          .number()
          .optional()
          .default(3)
          .describe('返回的最相关片段数量（1-10）'),
      }),
    },
  );
};
