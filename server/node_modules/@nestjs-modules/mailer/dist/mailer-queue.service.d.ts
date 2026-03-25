import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerEventService } from './mailer-event.service';
export declare class MailerQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly options;
    private readonly eventService?;
    private readonly logger;
    private queue;
    private Queue;
    constructor(options: MailerQueueOptions, eventService?: MailerEventService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    enqueue(mailOptions: ISendMailOptions, jobOptions?: Record<string, any>): Promise<any>;
    enqueueBatch(messages: ISendMailOptions[], jobOptions?: Record<string, any>): Promise<any[]>;
    getMetrics(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
    }>;
}
