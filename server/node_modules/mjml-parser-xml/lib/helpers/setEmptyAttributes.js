"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = setEmptyAttributes;
var _lodash = require("lodash");
function setEmptyAttributes(node) {
  if (!node.attributes) {
    node.attributes = {};
  }
  if (node.children) {
    (0, _lodash.forEach)(node.children, setEmptyAttributes);
  }
}
module.exports = exports.default;