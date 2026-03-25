"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mailer_1 = require("@nestjs-modules/mailer");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const configuration_1 = __importDefault(require("./config/configuration"));
const milvus_module_1 = require("./milvus/milvus.module");
const mcp_module_1 = require("./mcp/mcp.module");
const rag_module_1 = require("./rag/rag.module");
const chat_module_1 = require("./chat/chat.module");
const tools_module_1 = require("./tools/tools.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                load: [configuration_1.default],
                isGlobal: true,
            }),
            mailer_1.MailerModule.forRootAsync({
                useFactory: (configService) => ({
                    transport: {
                        host: configService.get('SMTP_HOST') || 'smtp.qq.com',
                        port: configService.get('SMTP_PORT') || 465,
                        secure: configService.get('SMTP_SECURE') === 'true' || true,
                        auth: {
                            user: configService.get('SMTP_USER'),
                            pass: configService.get('SMTP_PASS'),
                        },
                    },
                    defaults: {
                        from: configService.get('SMTP_FROM') || `"BookSoul Agent" <${configService.get('SMTP_USER')}>`,
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            milvus_module_1.MilvusModule,
            mcp_module_1.McpModule,
            rag_module_1.RagModule,
            chat_module_1.ChatModule,
            tools_module_1.ToolsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map