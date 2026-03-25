"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));
var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));
var _callSuper2 = _interopRequireDefault(require("@babel/runtime/helpers/callSuper"));
var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _lodash = require("lodash");
var _mjmlCore = require("mjml-core");
let MjAttributes = exports.default = /*#__PURE__*/function (_HeadComponent) {
  function MjAttributes() {
    (0, _classCallCheck2.default)(this, MjAttributes);
    return (0, _callSuper2.default)(this, MjAttributes, arguments);
  }
  (0, _inherits2.default)(MjAttributes, _HeadComponent);
  return (0, _createClass2.default)(MjAttributes, [{
    key: "handler",
    value: function handler() {
      const {
        add
      } = this.context;
      const {
        children
      } = this.props;
      (0, _lodash.forEach)(children, child => {
        const {
          tagName,
          attributes,
          children
        } = child;
        if (tagName === 'mj-class') {
          add('classes', attributes.name, (0, _lodash.omit)(attributes, ['name']));
          add('classesDefault', attributes.name, (0, _lodash.reduce)(children, (acc, {
            tagName,
            attributes
          }) => ({
            ...acc,
            [tagName]: attributes
          }), {}));
        } else {
          add('defaultAttributes', tagName, attributes);
        }
      });
    }
  }]);
}(_mjmlCore.HeadComponent);
(0, _defineProperty2.default)(MjAttributes, "componentName", 'mj-attributes');
module.exports = exports.default;