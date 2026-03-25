"use strict";
var MailerQueueModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerQueueModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_constant_1 = require("./constants/mailer.constant");
const mailer_queue_processor_1 = require("./mailer-queue.processor");
const mailer_queue_service_1 = require("./mailer-queue.service");
let MailerQueueModule = MailerQueueModule_1 = class MailerQueueModule {
    static register(options) {
        const optionsProvider = {
            provide: mailer_constant_1.MAILER_QUEUE_OPTIONS,
            useValue: options,
        };
        return {
            module: MailerQueueModule_1,
            providers: [optionsProvider, mailer_queue_service_1.MailerQueueService, mailer_queue_processor_1.MailerQueueProcessor],
            exports: [mailer_queue_service_1.MailerQueueService],
        };
    }
    static registerAsync(options) {
        const optionsProvider = {
            provide: mailer_constant_1.MAILER_QUEUE_OPTIONS,
            useFactory: options.useFactory,
            inject: options.inject || [],
        };
        return {
            module: MailerQueueModule_1,
            imports: options.imports || [],
            providers: [optionsProvider, mailer_queue_service_1.MailerQueueService, mailer_queue_processor_1.MailerQueueProcessor],
            exports: [mailer_queue_service_1.MailerQueueService],
        };
    }
};
exports.MailerQueueModule = MailerQueueModule;
exports.MailerQueueModule = MailerQueueModule = MailerQueueModule_1 = tslib_1.__decorate([
    (0, common_1.Module)({})
], MailerQueueModule);
