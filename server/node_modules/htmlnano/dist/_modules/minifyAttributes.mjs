import { isEventHandler } from '../helpers.mjs';
import { isListAttribute, isSingleValueAttribute } from './collapseAttributeWhitespace.mjs';

const asciiWhitespace = new Set([
    '\t',
    '\n',
    '\f',
    '\r',
    ' '
]);
const defaultOptions = {
    metaContent: true,
    redundantWhitespaces: 'safe'
};
function isAsciiWhitespace(char) {
    return asciiWhitespace.has(char);
}
function isAsciiDigit(char) {
    return char >= '0' && char <= '9';
}
function skipAsciiWhitespace(input, start) {
    let pos = start;
    while(pos < input.length && isAsciiWhitespace(input[pos])){
        pos += 1;
    }
    return pos;
}
function minifyMetaRefreshValue(value) {
    const input = value;
    let pos = skipAsciiWhitespace(input, 0);
    const timeStart = pos;
    while(pos < input.length && isAsciiDigit(input[pos])){
        pos += 1;
    }
    if (pos === timeStart) return null;
    const time = input.slice(timeStart, pos);
    while(pos < input.length){
        const ch = input[pos];
        if (isAsciiDigit(ch) || ch === '.') {
            pos += 1;
            continue;
        }
        break;
    }
    pos = skipAsciiWhitespace(input, pos);
    if (pos >= input.length) return time;
    const separator = input[pos];
    if (separator !== ';' && separator !== ',') return null;
    pos += 1;
    pos = skipAsciiWhitespace(input, pos);
    if (pos >= input.length) return time;
    let hasUrlPrefix = false;
    if (input[pos] === 'u' || input[pos] === 'U') {
        if (pos + 2 < input.length) {
            const maybeUrl = input.slice(pos, pos + 3);
            if (maybeUrl.toLowerCase() === 'url') {
                let prefixPos = skipAsciiWhitespace(input, pos + 3);
                if (prefixPos < input.length && input[prefixPos] === '=') {
                    prefixPos = skipAsciiWhitespace(input, prefixPos + 1);
                    hasUrlPrefix = true;
                    pos = prefixPos;
                }
            }
        }
    }
    if (pos >= input.length) return time;
    const firstUrlChar = input[pos];
    if (firstUrlChar === '"' || firstUrlChar === '\'') {
        if (!hasUrlPrefix) return null;
        const quote = firstUrlChar;
        const urlStart = pos + 1;
        const quoteIndex = input.indexOf(quote, urlStart);
        const url = quoteIndex === -1 ? input.slice(urlStart) : input.slice(urlStart, quoteIndex);
        if (!url) return time;
        const closingQuote = quoteIndex === -1 ? '' : quote;
        return `${time}${separator} URL=${quote}${url}${closingQuote}`;
    }
    const url = input.slice(pos).trim();
    if (!url) return time;
    return `${time}${separator} ${url}`;
}
function isMetaRefresh(attrs, tagName) {
    if (!tagName || tagName.toLowerCase() !== 'meta') return false;
    const httpEquiv = attrs['http-equiv'];
    if (typeof httpEquiv !== 'string') return false;
    return httpEquiv.trim().toLowerCase() === 'refresh';
}
function normalizeOptions(moduleOptions) {
    if (moduleOptions && typeof moduleOptions === 'object') {
        let redundantWhitespaces = defaultOptions.redundantWhitespaces;
        if (moduleOptions.redundantWhitespaces === 'aggressive') {
            redundantWhitespaces = 'agressive';
        } else if (moduleOptions.redundantWhitespaces === 'safe' || moduleOptions.redundantWhitespaces === 'agressive' || moduleOptions.redundantWhitespaces === false) {
            redundantWhitespaces = moduleOptions.redundantWhitespaces;
        }
        return {
            metaContent: moduleOptions.metaContent !== false,
            redundantWhitespaces
        };
    }
    return defaultOptions;
}
function collapseWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function minifyAttributeWhitespace(mode, attrName, attrValue, tagName) {
    if (!mode) {
        return null;
    }
    const attrNameLower = attrName.toLowerCase();
    if (isListAttribute(attrNameLower, tagName)) {
        const collapsed = collapseWhitespace(attrValue);
        return collapsed === attrValue ? null : collapsed;
    }
    if (isEventHandler(attrName)) {
        const trimmed = attrValue.trim();
        return trimmed === attrValue ? null : trimmed;
    }
    if (isSingleValueAttribute(attrNameLower, tagName)) {
        const trimmed = attrValue.trim();
        return trimmed === attrValue ? null : trimmed;
    }
    if (mode === 'agressive') {
        const trimmed = attrValue.trim();
        return trimmed === attrValue ? null : trimmed;
    }
    return null;
}
const mod = {
    onAttrs (_options, moduleOptions) {
        const normalizedOptions = normalizeOptions(moduleOptions);
        return (attrs, node)=>{
            if (normalizedOptions.metaContent && isMetaRefresh(attrs, node.tag)) {
                const content = attrs.content;
                if (typeof content === 'string') {
                    const minified = minifyMetaRefreshValue(content);
                    if (minified !== null && minified !== content) {
                        attrs.content = minified;
                    }
                }
            }
            if (normalizedOptions.redundantWhitespaces) {
                const tagName = node.tag ? node.tag.toLowerCase() : undefined;
                Object.entries(attrs).forEach(([attrName, attrValue])=>{
                    if (typeof attrValue !== 'string') return;
                    const minified = minifyAttributeWhitespace(normalizedOptions.redundantWhitespaces, attrName, attrValue, tagName);
                    if (minified !== null) {
                        attrs[attrName] = minified;
                    }
                });
            }
            return attrs;
        };
    }
};

export { mod as default };
