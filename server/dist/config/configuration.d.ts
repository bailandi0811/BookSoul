declare const _default: () => {
    database: {
        url: string | undefined;
    };
    milvus: {
        address: string;
        token: string;
        collectionName: string;
        vectorDim: number;
    };
    openai: {
        apiKey: string | undefined;
        baseUrl: string | undefined;
        embeddingModel: string;
        chatModel: string;
    };
    mcp: {
        amapApiKey: string | undefined;
    };
};
export default _default;
