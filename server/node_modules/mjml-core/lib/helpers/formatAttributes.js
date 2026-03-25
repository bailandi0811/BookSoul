"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _lodash = require("lodash");
var _type = require("../types/type");
var _default = (attributes, allowedAttributes) => (0, _lodash.reduce)(attributes, (acc, val, attrName) => {
  if (allowedAttributes && allowedAttributes[attrName]) {
    const TypeConstructor = (0, _type.initializeType)(allowedAttributes[attrName]);
    if (TypeConstructor) {
      const type = new TypeConstructor(val);
      return {
        ...acc,
        [attrName]: type.getValue()
      };
    }
  }
  return {
    ...acc,
    [attrName]: val
  };
}, {});
exports.default = _default;
module.exports = exports.default;