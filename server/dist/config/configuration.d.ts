declare const _default: () => {
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
