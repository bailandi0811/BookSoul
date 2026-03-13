import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { MetricType } from '@zilliz/milvus2-sdk-node';
import { config } from '../config.js';
import { milvusClient } from '../db/milvus.js';

const embeddings = new OpenAIEmbeddings({
    apiKey: config.openai.apiKey,
    model: config.openai.embeddingModel,
    configuration: {
        baseURL: config.openai.baseUrl,
    },
    dimensions: config.milvus.vectorDim,
});

const model = new ChatOpenAI({
    temperature: 0.7,
    apiKey: config.openai.apiKey,
    model: config.openai.chatModel,
    configuration: {
        baseURL: config.openai.baseUrl,
    },
    streaming: true, // Enable streaming for LangChain
});

export async function getEmbedding(text) {
    return await embeddings.embedQuery(text);
}

export async function retrieveRelevantContent(question, k = 3) {
    try {
        const queryVector = await getEmbedding(question);
        const searchResult = await milvusClient.search({
            collection_name: config.milvus.collectionName,
            vector: queryVector,
            limit: k,
            metric_type: MetricType.COSINE,
            output_fields: ['content', 'chapter_num', 'book_name'],
        });
        return searchResult.results;
    } catch (err) {
        console.error('Vector search failed:', err);
        return [];
    }
}

export async function generateResponseStream(question, context, res) {
    const prompt = `
你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题:
${context}

用户问题: ${question}

回答要求:
1. 如果片段中有相关信息，请结合小说内容给出详情，准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关的信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI助手的回答:
`;

    try {
        const stream = await model.stream(prompt);
        
        for await (const chunk of stream) {
            // Write SSE format
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('Error generating response:', error);
        res.write(`data: ${JSON.stringify({ error: 'Error generating response' })}\n\n`);
        res.end();
    }
}
