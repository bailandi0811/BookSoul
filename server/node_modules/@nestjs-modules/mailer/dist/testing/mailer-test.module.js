"use strict";
var MailerTestModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerTestModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_constant_1 = require("../constants/mailer.constant");
const mailer_service_1 = require("../mailer.service");
const mailer_batch_service_1 = require("../mailer-batch.service");
const mailer_event_service_1 = require("../mailer-event.service");
let MailerTestModule = MailerTestModule_1 = class MailerTestModule {
    static register(options) {
        return {
            module: MailerTestModule_1,
            providers: [
                {
                    provide: mailer_constant_1.MAILER_OPTIONS,
                    useValue: Object.assign({ transport: {
                            streamTransport: true,
                            newline: 'unix',
                            buffer: true,
                        } }, options),
                },
                mailer_event_service_1.MailerEventService,
                mailer_service_1.MailerService,
                mailer_batch_service_1.MailerBatchService,
            ],
            exports: [mailer_service_1.MailerService, mailer_batch_service_1.MailerBatchService, mailer_event_service_1.MailerEventService],
        };
    }
};
exports.MailerTestModule = MailerTestModule;
exports.MailerTestModule = MailerTestModule = MailerTestModule_1 = tslib_1.__decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], MailerTestModule);
