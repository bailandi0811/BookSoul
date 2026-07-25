export default () => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7),
  },
  milvus: {
    address: process.env.MILVUS_ADDRESS || 'localhost:19530',
    token: process.env.MILVUS_TOKEN || 'root:Milvus',
    collectionName: 'ebook',
    vectorDim: 1024,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    embeddingModel:
      process.env.EMBEDDING_MODEL_NAME || 'text-embedding-3-small',
    chatModel: process.env.MODEL_NAME || 'gpt-3.5-turbo',
  },
  mcp: {
    amapApiKey: process.env.AMAP_API_KEY,
  },
});
