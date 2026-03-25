Object.defineProperty(exports, '__esModule', { value: true });

var helpers_js = require('../helpers.js');

const attributesWithLists = new Map([
    [
        'class',
        new Set()
    ],
    [
        'dropzone',
        new Set()
    ],
    [
        'rel',
        new Set()
    ],
    [
        'ping',
        new Set()
    ],
    [
        'sandbox',
        new Set()
    ],
    /**
     * https://github.com/maltsev/htmlnano/issues/180
     * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link#attr-sizes
     *
     * "sizes" of <img> should not be modified, while "sizes" of <link> is a list of tokens.
     */ [
        'sizes',
        new Set([
            'link'
        ])
    ],
    [
        'headers',
        new Set()
    ] // td, th
]);
function isListAttribute(attrName, tagName) {
    const attrKey = attrName.toLowerCase();
    const tagSet = attributesWithLists.get(attrKey);
    if (!tagSet) {
        return false;
    }
    if (tagSet.size === 0) {
        return true;
    }
    if (!tagName) {
        return false;
    }
    return tagSet.has(tagName.toLowerCase());
}
/** empty set means the attribute is alwasy trimmable */ const attributesWithSingleValue = new Map([
    [
        'accept',
        new Set([
            'input'
        ])
    ],
    [
        'action',
        new Set([
            'form'
        ])
    ],
    [
        'accesskey',
        new Set()
    ],
    [
        'accept-charset',
        new Set([
            'form'
        ])
    ],
    [
        'cite',
        new Set([
            'blockquote',
            'del',
            'ins',
            'q'
        ])
    ],
    [
        'cols',
        new Set([
            'textarea'
        ])
    ],
    [
        'colspan',
        new Set([
            'td',
            'th'
        ])
    ],
    [
        'data',
        new Set([
            'object'
        ])
    ],
    [
        'dropzone',
        new Set()
    ],
    [
        'formaction',
        new Set([
            'button',
            'input'
        ])
    ],
    [
        'height',
        new Set([
            'canvas',
            'embed',
            'iframe',
            'img',
            'input',
            'object',
            'video'
        ])
    ],
    [
        'high',
        new Set([
            'meter'
        ])
    ],
    [
        'href',
        new Set([
            'a',
            'area',
            'base',
            'link'
        ])
    ],
    [
        'itemid',
        new Set()
    ],
    [
        'low',
        new Set([
            'meter'
        ])
    ],
    [
        'manifest',
        new Set([
            'html'
        ])
    ],
    [
        'max',
        new Set([
            'meter',
            'progress'
        ])
    ],
    [
        'maxlength',
        new Set([
            'input',
            'textarea'
        ])
    ],
    [
        'media',
        new Set([
            'source'
        ])
    ],
    [
        'min',
        new Set([
            'meter'
        ])
    ],
    [
        'minlength',
        new Set([
            'input',
            'textarea'
        ])
    ],
    [
        'optimum',
        new Set([
            'meter'
        ])
    ],
    [
        'ping',
        new Set([
            'a',
            'area'
        ])
    ],
    [
        'poster',
        new Set([
            'video'
        ])
    ],
    [
        'profile',
        new Set([
            'head'
        ])
    ],
    [
        'rows',
        new Set([
            'textarea'
        ])
    ],
    [
        'rowspan',
        new Set([
            'td',
            'th'
        ])
    ],
    [
        'size',
        new Set([
            'input',
            'select'
        ])
    ],
    [
        'span',
        new Set([
            'col',
            'colgroup'
        ])
    ],
    [
        'src',
        new Set([
            'audio',
            'embed',
            'iframe',
            'img',
            'input',
            'script',
            'source',
            'track',
            'video'
        ])
    ],
    [
        'start',
        new Set([
            'ol'
        ])
    ],
    [
        'step',
        new Set([
            'input'
        ])
    ],
    [
        'style',
        new Set()
    ],
    [
        'tabindex',
        new Set()
    ],
    [
        'usemap',
        new Set([
            'img',
            'object'
        ])
    ],
    [
        'value',
        new Set([
            'li',
            'meter',
            'progress'
        ])
    ],
    [
        'width',
        new Set([
            'canvas',
            'embed',
            'iframe',
            'img',
            'input',
            'object',
            'video'
        ])
    ]
]);
function isSingleValueAttribute(attrName, tagName) {
    const attrKey = attrName.toLowerCase();
    const tagSet = attributesWithSingleValue.get(attrKey);
    if (!tagSet) {
        return false;
    }
    if (!tagName) {
        return false;
    }
    if (tagSet.size === 0) {
        return true;
    }
    return tagSet.has(tagName.toLowerCase());
}
/** Collapse whitespaces inside list-like attributes (e.g. class, rel) */ const mod = {
    onAttrs () {
        return (attrs, node)=>{
            const newAttrs = attrs;
            const tagName = node.tag ? node.tag.toLowerCase() : undefined;
            Object.entries(attrs).forEach(([attrName, attrValue])=>{
                if (typeof attrValue !== 'string') return;
                const attrNameLower = attrName.toLowerCase();
                if (isListAttribute(attrNameLower, tagName)) {
                    newAttrs[attrName] = attrValue.replace(/\s+/g, ' ').trim();
                    return;
                }
                if (helpers_js.isEventHandler(attrName)) {
                    newAttrs[attrName] = attrValue.trim();
                } else if (isSingleValueAttribute(attrNameLower, tagName)) {
                    newAttrs[attrName] = attrValue.trim();
                }
            });
            return newAttrs;
        };
    }
};

exports.attributesWithLists = attributesWithLists;
exports.attributesWithSingleValue = attributesWithSingleValue;
exports.default = mod;
exports.isListAttribute = isListAttribute;
exports.isSingleValueAttribute = isSingleValueAttribute;
