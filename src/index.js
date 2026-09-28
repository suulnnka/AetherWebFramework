/**
 * AetherJS v0.2 —— JS 安全子集语言 + 伪 SSR 模板引擎(实现入口)。
 * 规格见 docs/language-spec-v0.2.md(十轮迭代定稿)。
 */

export { tokenize, KEYWORDS, BANNED_WORDS } from './lexer.js';
export { parse } from './parser.js';
export { analyze, analyzeExprWithBindings, DEFAULT_GLOBALS } from './analyze.js';
export { generate, makeExprEmitter, quote } from './codegen.js';
export { compile, createRuntime, makeAether, importModule } from './runtime.js';
export {
  parseTemplate, compileTemplate, treeToHtml, checkHtml,
  withTemplateHelpers, renderTemplate, TAGS,
  checkAttr, checkUrlValue, checkStyleProp, checkStyleValue, checkClassToken,
} from './template.js';
export { validateTree, materialize, createUiController } from './ui.js';
export { AetherError, CompileError } from './errors.js';
