"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCritiqueAgent = exports.createQueryRewriterNode = void 0;
const QUERY_REWRITE_PROMPT = `你是一个查询改写专家，负责分析并优化用户问题。

【原始问题】
{query}

【任务】
1. 分析问题是否复杂需要分解
2. 改写查询使其更适合检索
3. 评估问题的复杂性，决定检索深度

【问题类型判断】
- 简单事实型（"乔峰是谁"、"虚竹的武功有哪些"）→ 不需分解，top_k=3
- 比较型（"乔峰和段誉的性格有什么不同"）→ 需分解为子问题，top_k=6
- 多跳推理型（"乔峰父亲的师傅是谁"）→ 需分解为多步，top_k=8
- 开放式/概述型（"天龙八部讲了什么故事"）→ 广泛检索，top_k=10

【输出格式】
请严格以JSON格式输出，不要包含其他内容：
{
  "type": "simple|compare|multi_hop|broad",
  "rewritten_query": "改写后的单一查询（如果不分解）",
  "sub_questions": ["子问题1", "子问题2"],
  "top_k": 3-10的数字,
  "reasoning": "判断理由"
}`;
const createQueryRewriterNode = (model) => {
    return async (state) => {
        const queryAnalysis = await model.invoke([
            { role: 'system', content: QUERY_REWRITE_PROMPT },
            { role: 'user', content: state.query },
        ]);
        let analysis;
        try {
            analysis = JSON.parse(queryAnalysis.content);
        }
        catch {
            analysis = {
                type: 'simple',
                rewritten_query: state.query,
                sub_questions: [],
                top_k: 3,
                reasoning: 'Parse failed, using original query',
            };
        }
        const queries = analysis.sub_questions.length > 0
            ? analysis.sub_questions
            : [analysis.rewritten_query || state.query];
        return {
            rewritten_queries: queries,
            current_query_index: 0,
            retrieved_documents: [],
            critique: null,
            retry_count: 0,
            next_action: 'retrieve',
        };
    };
};
exports.createQueryRewriterNode = createQueryRewriterNode;
var critique_1 = require("./critique");
Object.defineProperty(exports, "createCritiqueAgent", { enumerable: true, get: function () { return critique_1.createCritiqueAgent; } });
//# sourceMappingURL=query-rewriter.js.map