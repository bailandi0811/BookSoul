import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';
export declare class MilvusService implements OnModuleInit {
    private configService;
    private client;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    getClient(): MilvusClient;
}
