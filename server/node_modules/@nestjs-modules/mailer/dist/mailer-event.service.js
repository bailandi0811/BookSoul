"use strict";
var MailerEventService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerEventService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
let MailerEventService = MailerEventService_1 = class MailerEventService {
    constructor(eventEmitter) {
        this.logger = new common_1.Logger(MailerEventService_1.name);
        if (eventEmitter) {
            this.eventEmitter = eventEmitter;
        }
    }
    emit(event, payload) {
        var _a;
        if ((_a = this.eventEmitter) === null || _a === void 0 ? void 0 : _a.emit) {
            try {
                this.eventEmitter.emit(event, payload);
            }
            catch (error) {
                this.logger.warn(`Failed to emit event ${event}: ${error.message}`);
            }
        }
    }
    isAvailable() {
        return !!this.eventEmitter;
    }
};
exports.MailerEventService = MailerEventService;
exports.MailerEventService = MailerEventService = MailerEventService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, common_1.Optional)()),
    tslib_1.__metadata("design:paramtypes", [Object])
], MailerEventService);
