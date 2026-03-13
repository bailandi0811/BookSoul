Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_create = require('./create.cjs');
const require_view = require('./view.cjs');
const require_delete = require('./delete.cjs');

//#region src/tools/google_calendar/index.ts
var google_calendar_exports = /* @__PURE__ */ require_runtime.__exportAll({
	GoogleCalendarCreateTool: () => require_create.GoogleCalendarCreateTool,
	GoogleCalendarDeleteTool: () => require_delete.GoogleCalendarDeleteTool,
	GoogleCalendarViewTool: () => require_view.GoogleCalendarViewTool
});

//#endregion
exports.GoogleCalendarCreateTool = require_create.GoogleCalendarCreateTool;
exports.GoogleCalendarDeleteTool = require_delete.GoogleCalendarDeleteTool;
exports.GoogleCalendarViewTool = require_view.GoogleCalendarViewTool;
Object.defineProperty(exports, 'google_calendar_exports', {
  enumerable: true,
  get: function () {
    return google_calendar_exports;
  }
});
//# sourceMappingURL=index.cjs.map