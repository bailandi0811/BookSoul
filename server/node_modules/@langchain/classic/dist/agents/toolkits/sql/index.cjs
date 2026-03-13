Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../../_virtual/_rolldown/runtime.cjs');
const require_prompt = require('./prompt.cjs');
const require_sql = require('./sql.cjs');

//#region src/agents/toolkits/sql/index.ts
var sql_exports = /* @__PURE__ */ require_runtime.__exportAll({
	SQL_PREFIX: () => require_prompt.SQL_PREFIX,
	SQL_SUFFIX: () => require_prompt.SQL_SUFFIX,
	SqlToolkit: () => require_sql.SqlToolkit,
	createSqlAgent: () => require_sql.createSqlAgent
});

//#endregion
exports.SQL_PREFIX = require_prompt.SQL_PREFIX;
exports.SQL_SUFFIX = require_prompt.SQL_SUFFIX;
exports.SqlToolkit = require_sql.SqlToolkit;
exports.createSqlAgent = require_sql.createSqlAgent;
Object.defineProperty(exports, 'sql_exports', {
  enumerable: true,
  get: function () {
    return sql_exports;
  }
});
//# sourceMappingURL=index.cjs.map