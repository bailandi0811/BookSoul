import { ISendMailOptions } from './send-mail-options.interface';
export declare enum MailerEvent {
    BEFORE_SEND = "mailer.before_send",
    AFTER_SEND = "mailer.after_send",
    SEND_ERROR = "mailer.send_error",
    QUEUED = "mailer.queued",
    QUEUE_COMPLETED = "mailer.queue.completed",
    QUEUE_FAILED = "mailer.queue.failed"
}
export interface MailerEventPayload {
    mailOptions: ISendMailOptions;
    result?: any;
    error?: Error;
    timestamp: Date;
}
