"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNovelSearchTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
const createNovelSearchTool = (milvusService, configService, embeddings) => {
    return (0, tools_1.tool)(async ({ query, top_k = 3 }) => {
        try {
            const queryVector = await embeddings.embedQuery(query);
            const searchResult = await milvusService.getClient().search({
                collection_name: configService.get('milvus.collectionName') || 'ebook',
                vector: queryVector,
                limit: top_k,
                metric_type: milvus2_sdk_node_1.MetricType.COSINE,
                output_fields: ['content', 'chapter_num', 'book_name'],
            });
            return JSON.stringify(searchResult.results, null, 2);
        }
        catch (error) {
            return JSON.stringify({ error: error.message, results: [] });
        }
    }, {
        name: 'novel_search',
        description: `搜索《天龙八部》小说数据库中的相关片段。
当用户询问关于小说情节、人物、武功、地点等问题时使用。
- query: 搜索查询（应简洁明了）
- top_k: 返回结果数量（默认3，复杂问题可增加到5-10）`,
        schema: zod_1.z.object({
            query: zod_1.z.string().describe('搜索查询，描述要查找的小说内容'),
            top_k: zod_1.z.number().optional().default(3).describe('返回的最相关片段数量（1-10）'),
        }),
    });
};
exports.createNovelSearchTool = createNovelSearchTool;
//# sourceMappingURL=novel-search.tool.js.map