Object.defineProperty(exports, '__esModule', { value: true });

var collapseAttributeWhitespace_js = require('./collapseAttributeWhitespace.js');

const validOptions = new Set([
    'frequency',
    'alphabetical'
]);
function resolveSortType(options) {
    if (options === true) return 'alphabetical';
    if (options === false) return false;
    return validOptions.has(options) ? options : false;
}

// class, rel, ping
class ListAttributeTokenChain {
    addFromNodeAttrsArray(attrValuesArray) {
        attrValuesArray.forEach((attrValue)=>{
            if (!attrValue) {
                return;
            }
            if (this.tokenCounts.has(attrValue)) {
                this.tokenCounts.set(attrValue, this.tokenCounts.get(attrValue) + 1);
            } else {
                this.tokenCounts.set(attrValue, 1);
            }
        });
    }
    createSortOrder() {
        const nextSortOrder = [
            ...this.tokenCounts.entries()
        ];
        nextSortOrder.sort((a, b)=>b[1] - a[1] || a[0].localeCompare(b[0]));
        this.sortedTokens = nextSortOrder.map((i)=>i[0]);
    }
    sortFromNodeAttrsArray(attrValuesArray) {
        const resultArray = [];
        const tokenCounts = new Map();
        attrValuesArray.forEach((attrValue)=>{
            var _tokenCounts_get;
            if (!attrValue) {
                return;
            }
            tokenCounts.set(attrValue, ((_tokenCounts_get = tokenCounts.get(attrValue)) != null ? _tokenCounts_get : 0) + 1);
        });
        if (!this.sortedTokens) {
            this.createSortOrder();
        }
        this.sortedTokens.forEach((k)=>{
            const count = tokenCounts.get(k);
            if (!count) {
                return;
            }
            for(let i = 0; i < count; i += 1){
                resultArray.push(k);
            }
        });
        return resultArray;
    }
    constructor(){
        /** <attr, frequency> */ this.tokenCounts = new Map();
        this.sortedTokens = null;
    }
}
/** Sort values inside list-like attributes (e.g. class, rel) */ const mod = {
    default (tree, options, moduleOptions) {
        const sortType = resolveSortType(moduleOptions);
        if (sortType === 'alphabetical') {
            return sortAttributesWithListsInAlphabeticalOrder(tree);
        }
        if (sortType === 'frequency') {
            return sortAttributesWithListsByFrequency(tree);
        }
        // Invalid configuration
        return tree;
    }
};
const splitListAttributeValues = (attrValue)=>attrValue.split(/\s+/).filter(Boolean);
function walkListAttributes(tree, walkFn) {
    tree.walk((node)=>{
        if (!node.attrs) {
            return node;
        }
        const tagName = node.tag ? node.tag.toLowerCase() : undefined;
        Object.entries(node.attrs).forEach(([attrName, attrValues])=>{
            const attrNameLower = attrName.toLowerCase();
            if (!collapseAttributeWhitespace_js.isListAttribute(attrNameLower, tagName) || typeof attrValues !== 'string') {
                return;
            }
            walkFn(node.attrs, attrName, attrValues);
        });
        return node;
    });
}
function sortAttributesWithListsInAlphabeticalOrder(tree) {
    walkListAttributes(tree, (nodeAttrs, attrName, attrValues)=>{
        const values = splitListAttributeValues(attrValues);
        if (values.length < 2) {
            return;
        }
        nodeAttrs[attrName] = values.sort((a, b)=>{
            // @ts-expect-error -- deliberately use minus operator to sort things
            return typeof a.localeCompare === 'function' ? a.localeCompare(b) : a - b;
        }).join(' ');
    });
    return tree;
}
function sortAttributesWithListsByFrequency(tree) {
    const tokenChainObj = {};
    // Traverse through tree to get frequency
    walkListAttributes(tree, (_nodeAttrs, attrName, attrValues)=>{
        const attrNameLower = attrName.toLowerCase();
        tokenChainObj[attrNameLower] = tokenChainObj[attrNameLower] || new ListAttributeTokenChain();
        tokenChainObj[attrNameLower].addFromNodeAttrsArray(splitListAttributeValues(attrValues));
    });
    // Traverse through tree again, this time sort the attribute values
    walkListAttributes(tree, (nodeAttrs, attrName, attrValues)=>{
        const attrNameLower = attrName.toLowerCase();
        if (!tokenChainObj[attrNameLower]) {
            return;
        }
        nodeAttrs[attrName] = tokenChainObj[attrNameLower].sortFromNodeAttrsArray(splitListAttributeValues(attrValues)).join(' ');
    });
    return tree;
}

exports.default = mod;
