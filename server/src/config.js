import 'dotenv/config';

export const config = {
    milvus: {
        address: process.env.MILVUS_ADDRESS || 'localhost:19530',
        token: process.env.MILVUS_TOKEN || 'root:Milvus',
        collectionName: 'ebook',
        vectorDim: 1024,
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        embeddingModel: process.env.EMBEDDING_MODEL_NAME || 'text-embedding-3-small',
        chatModel: process.env.MODEL_NAME || 'gpt-3.5-turbo',
    }
};
