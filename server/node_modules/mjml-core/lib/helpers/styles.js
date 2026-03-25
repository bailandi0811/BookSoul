"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildStyleFromComponents = buildStyleFromComponents;
exports.buildStyleFromTags = buildStyleFromTags;
var _lodash = require("lodash");
function buildStyleFromComponents(breakpoint, componentsHeadStyles, headStylesObject) {
  const headStyles = Object.values(headStylesObject);
  if (componentsHeadStyles.length === 0 && headStyles.length === 0) {
    return '';
  }
  return `
    <style type="text/css">${[...componentsHeadStyles, ...headStyles].reduce((result, styleFunction) => `${result}\n${styleFunction(breakpoint)}`, '')}
    </style>`;
}
function buildStyleFromTags(breakpoint, styles) {
  if (styles.length === 0) {
    return '';
  }
  return ` 
    <style type="text/css">${styles.reduce((result, style) => `${result}\n${(0, _lodash.isFunction)(style) ? style(breakpoint) : style}`, '')}
    </style>`;
}