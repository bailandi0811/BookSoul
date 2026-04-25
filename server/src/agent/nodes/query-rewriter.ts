import { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';

interface QueryAnalysis {
  type: 'simple' | 'compare' | 'multi_hop' | 'broad';
  rewritten_query: string;
  sub_questions: string[];
  top_k: number;
  reasoning: string;
}

const ENHANCED_QUERY_REWRITE_PROMPT = `你是一个查询改写专家，负责分析并优化用户问题。

【原始问题】
{query}

【意图分析结果】
- 问题类型：{intent_type}
- RAG需求概率：{rag_likelihood}
- 置信度：{confidence}
- 检测到的小说实体：{novel_entities}

【任务】
1. 分析问题是否复杂需要分解
2. 改写查询使其更适合检索
3. 评估问题的复杂性，决定检索深度

【意图感知的改写策略】
- simple_greeting/simple_fact: 不需分解，保持原样，top_k=2-3
- general_knowledge: 不需RAG，但可提供背景信息
- needs_rag: 根据问题复杂度决定top_k (3-6)
- complex_rag: 需要多步分解，top_k=8-10

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

export const createQueryRewriterNode = (model: ChatOpenAI) => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const intent = state.intent_classification;

    let prompt = ENHANCED_QUERY_REWRITE_PROMPT
      .replace('{query}', state.query)
      .replace('{intent_type}', intent?.intent_type || 'unknown')
      .replace('{rag_likelihood}', intent?.rag_likelihood?.toString() || '0.5')
      .replace('{confidence}', intent?.confidence?.toString() || '0.5')
      .replace('{novel_entities}', intent?.novel_entities_detected?.join(', ') || '无');

    if (state.critique && !state.critique.is_adequate) {
      prompt += `\n\n【注意】之前的检索结果被评估为不足！
评估理由: ${state.critique.reasoning}
缺失信息: ${state.critique.missing_aspects?.join(', ') || '无'}
建议改写为: ${state.critique.suggested_rewrite || '无'}

请根据上述评估，尝试一种完全不同的查询改写策略，以检索到更准确的信息。`;
    }

    const queryAnalysis = await model.invoke([
      { role: 'system', content: prompt },
      { role: 'user', content: state.query },
    ]);

    let analysis: QueryAnalysis;
    try {
      analysis = JSON.parse(queryAnalysis.content as string);
    } catch {
      // Fallback to simple query
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
      next_action: 'retrieve' as const,
    };
  };
};

export { createCritiqueAgent } from './critique';