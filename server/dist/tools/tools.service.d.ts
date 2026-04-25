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
        text: z.ZodOptional<z.ZodString>;
        html: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, {
        to: string;
        subject: string;
        text?: string | undefined;
        html?: string | undefined;
    }, {
        to: string;
        subject: string;
        text?: string | undefined;
        html?: string | undefined;
    }, string, unknown, "send_mail">;
}
