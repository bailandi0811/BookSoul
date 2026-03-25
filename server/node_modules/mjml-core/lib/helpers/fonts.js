"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildFontsTags = buildFontsTags;
var _lodash = require("lodash");
// eslint-disable-next-line import/prefer-default-export
function buildFontsTags(content, inlineStyle, fonts = {}) {
  const toImport = [];
  (0, _lodash.forEach)(fonts, (url, name) => {
    const regex = new RegExp(`"[^"]*font-family:[^"]*${name}[^"]*"`, 'gmi');
    const inlineRegex = new RegExp(`font-family:[^;}]*${name}`, 'gmi');
    if (content.match(regex) || inlineStyle.some(s => s.match(inlineRegex))) {
      toImport.push(url);
    }
  });
  if (toImport.length > 0) {
    return `
      <!--[if !mso]><!-->
        ${(0, _lodash.map)(toImport, url => `<link href="${url}" rel="stylesheet" type="text/css">`).join('\n')}
        <style type="text/css">
          ${(0, _lodash.map)(toImport, url => `@import url(${url});`).join('\n')}
        </style>
      <!--<![endif]-->\n
    `;
  }
  return '';
}