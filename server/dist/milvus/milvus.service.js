"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MilvusService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
let MilvusService = class MilvusService {
    configService;
    client;
    constructor(configService) {
        this.configService = configService;
    }
    async onModuleInit() {
        const address = this.configService.get('milvus.address') || 'localhost:19530';
        const token = this.configService.get('milvus.token') || 'root:Milvus';
        this.client = new milvus2_sdk_node_1.MilvusClient({ address, token });
        console.log('Connecting to Milvus at', address);
        try {
            await this.client.connectPromise;
            console.log('Connected to Milvus successfully.');
        }
        catch (error) {
            console.error('Failed to connect to Milvus:', error);
        }
    }
    getClient() {
        return this.client;
    }
};
exports.MilvusService = MilvusService;
exports.MilvusService = MilvusService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MilvusService);
//# sourceMappingURL=milvus.service.js.map