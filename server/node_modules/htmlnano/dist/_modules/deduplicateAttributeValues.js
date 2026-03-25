Object.defineProperty(exports, '__esModule', { value: true });

var collapseAttributeWhitespace_js = require('./collapseAttributeWhitespace.js');

const caseInsensitiveListAttributes = new Set([
    'rel',
    'sandbox',
    'dropzone',
    'sizes'
]);
function getDeduplicationKey(attrNameLower, attrValue) {
    if (!caseInsensitiveListAttributes.has(attrNameLower)) {
        return attrValue;
    }
    return attrValue.toLowerCase();
}
/** Deduplicate values inside list-like attributes (e.g. class, rel) */ const mod = {
    onAttrs () {
        return (attrs, node)=>{
            const newAttrs = attrs;
            const tagName = node.tag ? node.tag.toLowerCase() : undefined;
            Object.keys(attrs).forEach((attrName)=>{
                const attrNameLower = attrName.toLowerCase();
                if (!collapseAttributeWhitespace_js.isListAttribute(attrNameLower, tagName)) {
                    return;
                }
                if (typeof attrs[attrName] !== 'string') {
                    return;
                }
                const attrValues = attrs[attrName].split(/\s/);
                const uniqueAttrValues = new Set();
                const deduplicatedAttrValues = [];
                attrValues.forEach((attrValue)=>{
                    if (!attrValue) {
                        // Keep whitespaces
                        deduplicatedAttrValues.push('');
                        return;
                    }
                    const deduplicationKey = getDeduplicationKey(attrNameLower, attrValue);
                    if (uniqueAttrValues.has(deduplicationKey)) {
                        return;
                    }
                    deduplicatedAttrValues.push(attrValue);
                    uniqueAttrValues.add(deduplicationKey);
                });
                newAttrs[attrName] = deduplicatedAttrValues.join(' ');
            });
            return newAttrs;
        };
    }
};

exports.default = mod;
