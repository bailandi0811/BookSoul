Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_base = require('./expression_type_handlers/base.cjs');
const require_factory = require('./expression_type_handlers/factory.cjs');
let _langchain_core_output_parsers = require("@langchain/core/output_parsers");

//#region src/output_parsers/expression.ts
var expression_exports = /* @__PURE__ */ require_runtime.__exportAll({
	ExpressionParser: () => ExpressionParser,
	MasterHandler: () => require_factory.MasterHandler
});
/**
* We need to be able to handle the following cases:
* ExpressionStatement
*  CallExpression
*      Identifier | MemberExpression
*      ExpressionLiterals: [
*          CallExpression
*          StringLiteral
*          NumericLiteral
*          ArrayLiteralExpression
*              ExpressionLiterals
*          ObjectLiteralExpression
*              PropertyAssignment
*                  Identifier
*                  ExpressionLiterals
*      ]
*/
var ExpressionParser = class extends _langchain_core_output_parsers.BaseOutputParser {
	lc_namespace = [
		"langchain",
		"output_parsers",
		"expression"
	];
	parser;
	/**
	* We should separate loading the parser into its own function
	* because loading the grammar takes some time. If there are
	* multiple concurrent parse calls, it's faster to just wait
	* for building the parser once and then use it for all
	* subsequent calls. See expression.test.ts for an example.
	*/
	async ensureParser() {
		if (!this.parser) this.parser = await require_base.ASTParser.importASTParser();
	}
	/**
	* Parses the given text. It first ensures the parser is loaded, then
	* tries to parse the text. If the parsing fails, it throws an error. If
	* the parsing is successful, it returns the parsed expression.
	* @param text The text to be parsed.
	* @returns The parsed expression
	*/
	async parse(text) {
		await this.ensureParser();
		try {
			const node = this.parser(text).body;
			if (!require_base.ASTParser.isExpressionStatement(node)) throw new Error(`Expected ExpressionStatement, got ${node.type}`);
			const { expression: expressionStatement } = node;
			if (!require_base.ASTParser.isCallExpression(expressionStatement)) throw new Error("Expected CallExpression");
			return await require_factory.MasterHandler.createMasterHandler().handle(expressionStatement);
		} catch (err) {
			throw new Error(`Error parsing ${err}: ${text}`);
		}
	}
	/**
	* This method is currently empty, but it could be used to provide
	* instructions on the format of the input text.
	* @returns string
	*/
	getFormatInstructions() {
		return "";
	}
};

//#endregion
exports.ExpressionParser = ExpressionParser;
exports.MasterHandler = require_factory.MasterHandler;
Object.defineProperty(exports, 'expression_exports', {
  enumerable: true,
  get: function () {
    return expression_exports;
  }
});
//# sourceMappingURL=expression.cjs.map