"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = convertBooleansOnAttrs;
var _lodash = require("lodash");
/**
 * Convert "true" and "false" string attributes values
 * to corresponding Booleans
 */

function convertBooleansOnAttrs(attrs) {
  return (0, _lodash.mapValues)(attrs, val => {
    if (val === 'true') {
      return true;
    }
    if (val === 'false') {
      return false;
    }
    return val;
  });
}
module.exports = exports.default;