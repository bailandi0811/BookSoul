import { SentMessageInfo } from 'nodemailer';
import { ISendMailOptions } from './send-mail-options.interface';
export interface BatchMailOptions {
    messages: ISendMailOptions[];
    concurrency?: number;
    stopOnError?: boolean;
}
export interface BatchItemResult {
    index: number;
    success: boolean;
    result?: SentMessageInfo;
    error?: Error;
}
export interface BatchResult {
    total: number;
    sent: number;
    failed: number;
    results: BatchItemResult[];
}
