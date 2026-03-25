import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
export declare class ToolsService {
    private readonly mailerService;
    private readonly configService;
    private readonly logger;
    constructor(mailerService: MailerService, configService: ConfigService);
    getSendMailTool(): import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
        to: z.ZodString;
        subject: z.ZodString;
        text: z.ZodString;
        html: z.ZodString;
    }, z.core.$strip>, {
        to: string;
        subject: string;
        text: string;
        html: string;
    }, {
        to: string;
        subject: string;
        text: string;
        html: string;
    }, string, unknown, "send_mail">;
}
