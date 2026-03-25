Object.defineProperty(exports, '__esModule', { value: true });

// Specification: https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
// See also: https://github.com/posthtml/posthtml-render/pull/30
// See also: https://github.com/maltsev/htmlnano/issues/6#issuecomment-707105334
/** Disable quoteAllAttributes while not overriding the configuration */ const mod = {
    default: function removeAttributeQuotes(tree, _options, moduleOptions) {
        var _tree, _options1, _tree_options, _quoteAllAttributes;
        (_options1 = (_tree = tree).options) != null ? _options1 : _tree.options = {};
        if (moduleOptions && typeof moduleOptions === 'object' && moduleOptions.force) {
            tree.options.quoteAllAttributes = false;
            return tree;
        }
        (_quoteAllAttributes = (_tree_options = tree.options).quoteAllAttributes) != null ? _quoteAllAttributes : _tree_options.quoteAllAttributes = false;
        return tree;
    }
};

exports.default = mod;
