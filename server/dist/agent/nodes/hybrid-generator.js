"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHybridGeneratorNode = void 0;
const messages_1 = require("@langchain/core/messages");
const HYBRID_GENERATE_PROMPT = `你是一个《天龙八部》小说助手，有部分检索结果可以参考。

【用户问题】
{query}

【部分检索到的上下文】（可能不完整）
{context}

【检索置信度】
{critique_info}

【你的角色】
{role_prompt}

【任务】
1. 优先使用检索到的片段回答
2. 如果检索结果不足，用你自己的知识补充
3. 诚实告知用户哪些是你检索到的，哪些是你推测的
4. 保持角色设定

请基于以上信息回答用户问题。`;
const createHybridGeneratorNode = (model, tools, getPersonaPrompt) => {
    return async (state) => {
        const personaPrompt = getPersonaPrompt(state.persona);
        const allDocs = state.retrieved_documents.flatMap(d => d.docs);
        const context = allDocs.length > 0
            ? allDocs.map((doc, i) => `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`).join('\n\n')
            : '（未检索到相关片段）';
        const critiqueInfo = state.critique
            ? `信心指数: ${state.critique.confidence}\n缺失方面: ${state.critique.missing_aspects?.join(', ') || '无'}`
            : '未进行评估';
        const prompt = HYBRID_GENERATE_PROMPT
            .replace('{query}', state.query)
            .replace('{context}', context)
            .replace('{critique_info}', critiqueInfo)
            .replace('{role_prompt}', personaPrompt);
        try {
            if (!tools || tools.length === 0) {
                const stream = await model.stream(prompt);
                return {
                    stream,
                    final_response: '',
                    references: allDocs,
                    has_used_rag: allDocs.length > 0,
                    next_action: 'done',
                };
            }
            const modelWithTools = model.bindTools(tools);
            const messages = [{ role: 'user', content: prompt }];
            const response = await modelWithTools.invoke(messages);
            if (response.tool_calls && response.tool_calls.length > 0) {
                const toolMessages = [];
                for (const toolCall of response.tool_calls) {
                    const tool = tools.find(t => t.name === toolCall.name);
                    if (tool) {
                        try {
                            const toolResult = await tool.invoke(toolCall.args);
                            toolMessages.push(new messages_1.ToolMessage({
                                content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                                tool_call_id: toolCall.id || '',
                            }));
                        }
                        catch (err) {
                            toolMessages.push(new messages_1.ToolMessage({
                                content: `Error: ${err.message}`,
                                tool_call_id: toolCall.id || '',
                            }));
                        }
                    }
                }
                const finalResponse = await model.stream([...messages, response, ...toolMessages]);
                return {
                    stream: finalResponse,
                    final_response: '',
                    references: allDocs,
                    has_used_rag: true,
                    next_action: 'done',
                };
            }
            else {
                if (response.content) {
                    const contentStr = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
                    if (contentStr.trim().length > 0) {
                        return {
                            final_response: contentStr,
                            references: allDocs,
                            has_used_rag: allDocs.length > 0,
                            next_action: 'done',
                        };
                    }
                }
                const stream = await model.stream(prompt);
                return {
                    stream,
                    final_response: '',
                    references: allDocs,
                    has_used_rag: allDocs.length > 0,
                    next_action: 'done',
                };
            }
        }
        catch (error) {
            return {
                final_response: `生成回答时出错: ${error.message}`,
                references: allDocs,
                has_used_rag: allDocs.length > 0,
                next_action: 'done',
            };
        }
    };
};
exports.createHybridGeneratorNode = createHybridGeneratorNode;
//# sourceMappingURL=hybrid-generator.js.map