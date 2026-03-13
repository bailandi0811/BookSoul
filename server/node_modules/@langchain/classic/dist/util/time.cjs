Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/util/time.ts
var time_exports = /* @__PURE__ */ require_runtime.__exportAll({ sleep: () => sleep });
/**
* Sleep for a given amount of time.
* @param ms - The number of milliseconds to sleep for. Defaults to 1000.
* @returns A promise that resolves when the sleep is complete.
*/
async function sleep(ms = 1e3) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

//#endregion
exports.sleep = sleep;
Object.defineProperty(exports, 'time_exports', {
  enumerable: true,
  get: function () {
    return time_exports;
  }
});
//# sourceMappingURL=time.cjs.map