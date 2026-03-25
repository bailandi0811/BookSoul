"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.assignComponents = assignComponents;
exports.default = void 0;
exports.registerComponent = registerComponent;
var _lodash = require("lodash");
var _mjmlValidator = require("mjml-validator");
const components = {};
function assignComponents(target, source) {
  for (const component of source) {
    target[component.componentName || (0, _lodash.kebabCase)(component.name)] = component;
  }
}
function registerComponent(Component, options = {}) {
  assignComponents(components, [Component]);
  if (Component.dependencies && options.registerDependencies) {
    (0, _mjmlValidator.registerDependencies)(Component.dependencies);
  }
}
var _default = exports.default = components;