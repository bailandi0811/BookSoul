"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerEvent = void 0;
var MailerEvent;
(function (MailerEvent) {
    MailerEvent["BEFORE_SEND"] = "mailer.before_send";
    MailerEvent["AFTER_SEND"] = "mailer.after_send";
    MailerEvent["SEND_ERROR"] = "mailer.send_error";
    MailerEvent["QUEUED"] = "mailer.queued";
    MailerEvent["QUEUE_COMPLETED"] = "mailer.queue.completed";
    MailerEvent["QUEUE_FAILED"] = "mailer.queue.failed";
})(MailerEvent || (exports.MailerEvent = MailerEvent = {}));
