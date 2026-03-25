"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = buildMediaQueriesTags;
var _lodash = require("lodash");
// eslint-disable-next-line import/prefer-default-export
function buildMediaQueriesTags(breakpoint, mediaQueries = {}, options = {}) {
  if ((0, _lodash.isEmpty)(mediaQueries)) {
    return '';
  }
  const {
    forceOWADesktop = false,
    printerSupport = false
  } = options;
  const baseMediaQueries = (0, _lodash.map)(mediaQueries, (mediaQuery, className) => `.${className} ${mediaQuery}`);
  const thunderbirdMediaQueries = (0, _lodash.map)(mediaQueries, (mediaQuery, className) => `.moz-text-html .${className} ${mediaQuery}`);
  const owaQueries = (0, _lodash.map)(baseMediaQueries, mq => `[owa] ${mq}`);
  return `
    <style type="text/css">
      @media only screen and (min-width:${breakpoint}) {
        ${baseMediaQueries.join('\n')}
      }
    </style>
    <style media="screen and (min-width:${breakpoint})">
      ${thunderbirdMediaQueries.join('\n')}
    </style>
    ${printerSupport ? `<style type="text/css">
            @media only print {
              ${baseMediaQueries.join('\n')}
            }
          </style>` : ``}
    ${forceOWADesktop ? `<style type="text/css">\n${owaQueries.join('\n')}\n</style>` : ``}
  `;
}
module.exports = exports.default;