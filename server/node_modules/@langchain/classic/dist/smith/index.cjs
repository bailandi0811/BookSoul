Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_config = require('./config.cjs');
const require_runner_utils = require('./runner_utils.cjs');

//#region src/smith/index.ts
var smith_exports = /* @__PURE__ */ require_runtime.__exportAll({
	Criteria: () => require_config.Criteria,
	EmbeddingDistance: () => require_config.EmbeddingDistance,
	LabeledCriteria: () => require_config.LabeledCriteria,
	isCustomEvaluator: () => require_config.isCustomEvaluator,
	isOffTheShelfEvaluator: () => require_config.isOffTheShelfEvaluator,
	runOnDataset: () => require_runner_utils.runOnDataset
});

//#endregion
exports.Criteria = require_config.Criteria;
exports.EmbeddingDistance = require_config.EmbeddingDistance;
exports.LabeledCriteria = require_config.LabeledCriteria;
exports.isCustomEvaluator = require_config.isCustomEvaluator;
exports.isOffTheShelfEvaluator = require_config.isOffTheShelfEvaluator;
exports.runOnDataset = require_runner_utils.runOnDataset;
Object.defineProperty(exports, 'smith_exports', {
  enumerable: true,
  get: function () {
    return smith_exports;
  }
});
//# sourceMappingURL=index.cjs.map