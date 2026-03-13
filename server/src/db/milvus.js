import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { config } from '../config.js';

export const milvusClient = new MilvusClient({
    address: config.milvus.address,
    token: config.milvus.token,
});

export async function connectMilvus() {
    try {
        await milvusClient.connectPromise;
        console.log('Connected to Milvus');
        await milvusClient.loadCollection({
            collection_name: config.milvus.collectionName,
        });
        console.log(`Collection ${config.milvus.collectionName} loaded`);
    } catch (error) {
        console.error('Failed to connect to Milvus or load collection:', error);
        // Don't throw here, let the app start but maybe functionality is limited
    }
}
