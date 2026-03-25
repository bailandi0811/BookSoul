export interface MailerQueueOptions {
    connection: {
        host?: string;
        port?: number;
        password?: string;
        db?: number;
        [key: string]: any;
    };
    defaultJobOptions?: {
        attempts?: number;
        backoff?: {
            type: 'exponential' | 'fixed';
            delay: number;
        };
        removeOnComplete?: boolean | number;
        removeOnFail?: boolean | number;
        priority?: number;
        delay?: number;
    };
    queueName?: string;
}
