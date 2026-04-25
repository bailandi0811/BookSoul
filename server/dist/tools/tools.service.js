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
var ToolsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolsService = void 0;
const common_1 = require("@nestjs/common");
const mailer_1 = require("@nestjs-modules/mailer");
const config_1 = require("@nestjs/config");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
let ToolsService = ToolsService_1 = class ToolsService {
    mailerService;
    configService;
    logger = new common_1.Logger(ToolsService_1.name);
    constructor(mailerService, configService) {
        this.mailerService = mailerService;
        this.configService = configService;
    }
    getSendMailTool() {
        const sendMailArgsSchema = zod_1.z.object({
            to: zod_1.z.string().email().describe('收件人邮箱地址，例如: test@example.com'),
            subject: zod_1.z.string().describe('邮件主题'),
            text: zod_1.z.string().describe('纯文本内容，可选').optional(),
            html: zod_1.z.string().describe('HTML 内容，可选').optional(),
        });
        return (0, tools_1.tool)(async ({ to, subject, text, html }) => {
            try {
                const fallbackFrom = this.configService.get('SMTP_FROM') || this.configService.get('SMTP_USER');
                await this.mailerService.sendMail({
                    to,
                    subject,
                    text: text ?? '(来自 BookSoul Agent 的邮件)',
                    html: html ?? `<p>${text ?? '(来自 BookSoul Agent 的邮件)'}</p>`,
                    from: fallbackFrom,
                });
                this.logger.log(`Email sent successfully to ${to}`);
                return `邮箱发送成功，收件人: ${to}, 主题: ${subject}`;
            }
            catch (error) {
                this.logger.error(`Failed to send email: ${error.message}`);
                return `发送邮件失败: ${error.message}`;
            }
        }, {
            name: 'send_mail',
            description: '发送电子邮件。当用户要求给某个邮箱发送内容、文章片段、聊天记录或通知时调用。需要提供收件人邮箱地址、主题、文本内容。',
            schema: sendMailArgsSchema,
        });
    }
};
exports.ToolsService = ToolsService;
exports.ToolsService = ToolsService = ToolsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mailer_1.MailerService,
        config_1.ConfigService])
], ToolsService);
//# sourceMappingURL=tools.service.js.map