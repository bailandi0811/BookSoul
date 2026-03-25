Object.defineProperty(exports, '__esModule', { value: true });

function normalizeAttrValue(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? '' : trimmed.toLowerCase();
}
function findAttrEntry(attrs, name) {
    const targetName = name.toLowerCase();
    for (const [attrName, attrValue] of Object.entries(attrs)){
        if (attrName.toLowerCase() === targetName) {
            return {
                name: attrName,
                value: attrValue
            };
        }
    }
    return null;
}
function getNormalizedAttrValue(attrs, name) {
    const entry = findAttrEntry(attrs, name);
    return entry ? normalizeAttrValue(entry.value) : null;
}
function hasAttr(attrs, name) {
    return findAttrEntry(attrs, name) !== null;
}
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#JavaScript_types
const redundantScriptTypes = new Set([
    'application/javascript',
    'application/ecmascript',
    'application/x-ecmascript',
    'application/x-javascript',
    'text/javascript',
    'text/ecmascript',
    'text/javascript1.0',
    'text/javascript1.1',
    'text/javascript1.2',
    'text/javascript1.3',
    'text/javascript1.4',
    'text/javascript1.5',
    'text/jscript',
    'text/livescript',
    'text/x-ecmascript',
    'text/x-javascript'
]);
// https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#missing-value-default
const missingValueDefaultAttributes = {
    form: {
        method: 'get'
    },
    input: {
        type: 'text'
    },
    button: {
        // https://html.spec.whatwg.org/multipage/form-elements.html#attr-button-type
        type: 'submit'
    },
    script: {
        language: 'javascript',
        type: (attrs)=>{
            const typeValue = getNormalizedAttrValue(attrs, 'type');
            return typeValue !== null && redundantScriptTypes.has(typeValue);
        },
        // Remove attribute if the function returns false
        charset: (attrs)=>{
            // The charset attribute only really makes sense on “external” SCRIPT elements:
            // http://perfectionkills.com/optimizing-html/#8_script_charset
            return !hasAttr(attrs, 'src');
        }
    },
    style: {
        media: 'all',
        type: 'text/css'
    },
    link: {
        media: 'all',
        type: (attrs)=>{
            // https://html.spec.whatwg.org/multipage/links.html#link-type-stylesheet
            const relValue = getNormalizedAttrValue(attrs, 'rel');
            const typeValue = getNormalizedAttrValue(attrs, 'type');
            if (!relValue || !typeValue) {
                return false;
            }
            const relTokens = relValue.split(/\s+/);
            const isRelStyleSheet = relTokens.includes('stylesheet');
            const isTypeTextCSS = typeValue === 'text/css';
            // Only "text/css" is redundant for link[rel=stylesheet]. Otherwise "type" shouldn't be removed
            return isRelStyleSheet && isTypeTextCSS;
        }
    },
    // See: https://html.spec.whatwg.org/#lazy-loading-attributes
    img: {
        loading: 'eager',
        // https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-decoding
        decoding: 'auto'
    },
    iframe: {
        loading: 'eager'
    },
    // https://html.spec.whatwg.org/multipage/media.html#htmltrackelement
    track: {
        kind: 'subtitles'
    },
    textarea: {
        // https://html.spec.whatwg.org/multipage/form-elements.html#dom-textarea-wrap
        wrap: 'soft'
    },
    area: {
        // https://html.spec.whatwg.org/multipage/image-maps.html#attr-area-shape
        shape: 'rect'
    }
};
const tagsHaveMissingValueDefaultAttributes = new Set(Object.keys(missingValueDefaultAttributes));
/** Removes redundant attributes */ const mod = {
    onAttrs () {
        return (attrs, node)=>{
            if (!node.tag) return attrs;
            const newAttrs = attrs;
            const attrsRecord = attrs;
            if (tagsHaveMissingValueDefaultAttributes.has(node.tag)) {
                const tagRedundantAttributes = missingValueDefaultAttributes[node.tag];
                for (const redundantAttributeName of Object.keys(tagRedundantAttributes)){
                    const tagRedundantAttributeValue = tagRedundantAttributes[redundantAttributeName];
                    let isRemove = false;
                    const attrEntry = findAttrEntry(attrsRecord, redundantAttributeName);
                    if (typeof tagRedundantAttributeValue === 'function') {
                        isRemove = tagRedundantAttributeValue(attrsRecord);
                    } else if (attrEntry) {
                        const normalizedValue = normalizeAttrValue(attrEntry.value);
                        isRemove = normalizedValue !== null && normalizedValue === tagRedundantAttributeValue;
                    }
                    if (isRemove && attrEntry) {
                        delete newAttrs[attrEntry.name];
                    }
                }
            }
            return newAttrs;
        };
    }
};

exports.default = mod;
exports.redundantScriptTypes = redundantScriptTypes;
