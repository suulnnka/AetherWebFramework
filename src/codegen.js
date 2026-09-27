/**
 * AetherJS v0.2 代码生成(规格第 4 节 + 附录 B.1/B.2)。
 *
 * 产物形态:ES 模块 `export default function (AETHER) { … }`
 *  —— 模块自动严格模式、独立作用域;浏览器经 Blob URL 动态 import 加载,
 *    Node 测试经 data: URL,同为"资源加载"而非 eval(规格 B.2 定案)。
 *
 * 全部动态语义经 AETHER 助手:$get/$set(类型分派)、$mcall(成员调用绑 this)、
 * $new/$class、运算符类型检查($add…$shru)、$test(条件须 boolean)、
 * $catch(语言错误 → "类型: 描述" 字符串,规格 9)。
 * 表达式采用"复合必加括号"策略,优先级一目了然。
 * 表达式发射器独立成工厂 —— 模板插值复用同一套(规格 16.2)。
 */

import { KEYWORDS } from './lexer.js';

const IND = '  ';

/** 二元运算符 → AETHER 助手名(===/!== 原生,无隐式转换) */
const OP_HELPER = {
  '+': '$add', '-': '$sub', '*': '$mul', '/': '$div', '%': '$mod', '**': '$pow',
  '&': '$band', '|': '$bor', '^': '$bxor', '<<': '$shl', '>>': '$shr', '>>>': '$shru',
  '<': '$lt', '<=': '$le', '>': '$gt', '>=': '$ge',
};

/** 复合赋值 → 对应二元运算符 */
const COMPOUND_OP = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '**=': '**',
  '&=': '&', '|=': '|', '^=': '^', '<<=': '<<', '>>=': '>>', '>>>=': '>>>',
};

/** 可折叠的运算(结果必须与运行时助手逐位一致;非有限数不折,规格 4) */
function fold(op, a, b) {
  let v;
  switch (op) {
    case '+': v = a + b; break;
    case '-': v = a - b; break;
    case '*': v = a * b; break;
    case '/': v = a / b; break;
    case '%': v = a % b; break;
    case '**': v = a ** b; break;
    case '<': v = a < b; break;
    case '<=': v = a <= b; break;
    case '>': v = a > b; break;
    case '>=': v = a >= b; break;
    default: return null;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** 字符串 → 单行安全的 JS 字面量(含 \u2028/\u2029 与控制字符) */
export function quote(s) {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\v') out += '\\v';
    else if (c < 0x20 || c === 0x2028 || c === 0x2029) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isReserved = (name) => KEYWORDS.has(name);
const numLit = (v) => String(v); // 非有限数已在 fold 排除

/** 表达式发射器工厂(语言程序与模板插值共用) */
export function makeExprEmitter() {
  const isAtom = (e) =>
    e.t === 'Num' || e.t === 'Str' || e.t === 'Bool' || e.t === 'Null' ||
    e.t === 'Ident' || e.t === 'This';
  const base = (e) => (isAtom(e) ? expr(e) : '(' + expr(e) + ')');

  function expr(e) {
    switch (e.t) {
      case 'Num': return numLit(e.value);
      case 'Str': return quote(e.value);
      case 'Bool': return String(e.value);
      case 'Null': return 'null';
      case 'Ident': return e.name;
      case 'This': return 'this';

      case 'Arr': return '[' + e.items.map(expr).join(', ') + ']';
      case 'Obj':
        if (e.props.length === 0) return '$obj([])';
        return '$obj([\n' + e.props.map((p) =>
          IND + '[' + quote(p.key) + ', ' + expr(p.value) + ']'
        ).join(',\n') + '\n])';

      case 'Member': return '$get(' + expr(e.obj) + ', ' + quote(e.prop) + ')';
      case 'Index': return '$get(' + expr(e.obj) + ', ' + expr(e.key) + ')';

      case 'Call': {
        const args = e.args.map(expr);
        const c = e.callee;
        if (c.t === 'Member') return '$mcall(' + expr(c.obj) + ', ' + quote(c.prop) + ', [' + args.join(', ') + '])';
        if (c.t === 'Index') return '$mcall(' + expr(c.obj) + ', ' + expr(c.key) + ', [' + args.join(', ') + '])';
        return '$call(' + expr(c) + ', [' + args.join(', ') + '])';
      }

      case 'New': return '$new(' + expr(e.target) + ', [' + e.args.map(expr).join(', ') + '])';

      case 'Unary':
        if (e.op === '-') return '$neg(' + base(e.arg) + ')';
        if (e.op === '~') return '$bnot(' + base(e.arg) + ')';
        return '$not(' + base(e.arg) + ')';

      case 'Update': return updateExpr(e);

      case 'Binary': {
        if (e.op === '===') return '(' + base(e.l) + ' === ' + base(e.r) + ')';
        if (e.op === '!==') return '(' + base(e.l) + ' !== ' + base(e.r) + ')';
        if (e.op === '&&') return '($bool(' + expr(e.l) + ') && $bool(' + expr(e.r) + '))';
        if (e.op === '||') return '($bool(' + expr(e.l) + ') || $bool(' + expr(e.r) + '))';
        if (e.l.t === 'Num' && e.r.t === 'Num') {
          const v = fold(e.op, e.l.value, e.r.value);
          if (v !== null) return numLit(v);
        }
        if (e.op === '+' && e.l.t === 'Str' && e.r.t === 'Str') {
          return quote(e.l.value + e.r.value);
        }
        return OP_HELPER[e.op] + '(' + expr(e.l) + ', ' + expr(e.r) + ')';
      }

      case 'Cond': return '($test(' + expr(e.test) + ') ? ' + base(e.then) + ' : ' + base(e.else) + ')';

      case 'Assign': return assignExpr(e);

      case 'Func': {
        const params = e.params.map((p) => p.name + (p.default ? ' = ' + expr(p.default) : '')).join(', ');
        return '(function ' + (e.name ?? '') + '(' + params + ') ' + '{\n' + emitBlockPlain(e.body) + '\n})';
      }

      case 'Arrow': {
        const params = e.params.map((p) => p.name + (p.default ? ' = ' + expr(p.default) : '')).join(', ');
        if (e.isExprBody) return '((' + params + ') => ' + base(e.body) + ')';
        return '((' + params + ') => ' + '{\n' + emitBlockPlain(e.body) + '\n})';
      }

      default: throw new Error('codegen:未知表达式 ' + e.t);
    }
  }

  function updateExpr(e) {
    const one = e.op === '++' ? '$add(v, 1)' : '$sub(v, 1)';
    const a = e.arg;
    if (a.t === 'Ident') {
      return e.prefix
        ? '((v) => (' + a.name + ' = ' + one + '))(' + a.name + ')'
        : '((v) => (' + a.name + ' = ' + one + ', v))(' + a.name + ')';
    }
    if (a.t === 'Member') {
      const get = '$get(o, ' + quote(a.prop) + ')';
      return e.prefix
        ? '((o) => { const v = ' + one.replace('v', get) + '; $set(o, ' + quote(a.prop) + ', v); return v; })(' + expr(a.obj) + ')'
        : '((o) => { const v = ' + get + '; $set(o, ' + quote(a.prop) + ', ' + one + '); return v; })(' + expr(a.obj) + ')';
    }
    // Index:o 与 k 各求值一次
    return e.prefix
      ? '((o, k) => { const v = ' + one.replace('v', '$get(o, k)') + '; $set(o, k, v); return v; })(' + expr(a.obj) + ', ' + expr(a.key) + ')'
      : '((o, k) => { const v = $get(o, k); $set(o, k, ' + one + '); return v; })(' + expr(a.obj) + ', ' + expr(a.key) + ')';
  }

  function assignExpr(e) {
    const v = expr(e.value);
    const t = e.target;
    if (t.t === 'Ident') {
      if (e.op === '=') return '(' + t.name + ' = ' + v + ')';
      const helper = OP_HELPER[COMPOUND_OP[e.op]];
      return '(' + t.name + ' = ' + helper + '(' + t.name + ', ' + v + '))';
    }
    if (t.t === 'Member') {
      if (e.op === '=') {
        if (t.prop === 'length') return '$len(' + expr(t.obj) + ', ' + v + ')';
        return '$set(' + expr(t.obj) + ', ' + quote(t.prop) + ', ' + v + ')';
      }
      const helper = OP_HELPER[COMPOUND_OP[e.op]];
      return '((o) => $set(o, ' + quote(t.prop) + ', ' + helper + '($get(o, ' + quote(t.prop) + '), ' + v + ')))(' + expr(t.obj) + ')';
    }
    if (e.op === '=') return '$set(' + expr(t.obj) + ', ' + expr(t.key) + ', ' + v + ')';
    const helper = OP_HELPER[COMPOUND_OP[e.op]];
    return '((o, k, v) => $set(o, k, ' + helper + '($get(o, k), v)))(' + expr(t.obj) + ', ' + expr(t.key) + ', ' + v + ')';
  }

  /** 表达式位里的函数体(嵌套语句,扁平缩进) */
  function emitBlockPlain(block) {
    return block.body.map((s) => stmtPlain(s)).join('\n');
  }

  function stmtPlain(s) {
    switch (s.t) {
      case 'Let': return 'let ' + s.decls.map((d) => d.name + ' = ' + expr(d.init)).join(', ') + ';';
      case 'Class': return 'let ' + s.name + ' = $class(' + quote(s.name) + ', [' +
        s.fields.map((f) => '[' + quote(f.name) + ', ' + (f.init ? 'function () { return ' + expr(f.init) + '; }' : 'null') + ']').join(', ') +
        '], [' + classMethods(s) + ']);';
      case 'Func': return 'function ' + s.name + '(' + paramsOf(s) + ') {\n' + emitBlockPlain(s.body) + '\n}';
      case 'ExprStmt': return expr(s.expr) + ';';
      case 'Return': return 'return' + (s.expr ? ' ' + expr(s.expr) : '') + ';';
      case 'Throw': return 'throw ' + expr(s.expr) + ';';
      case 'Break': return 'break;';
      case 'Continue': return 'continue;';
      case 'If': {
        let out = 'if ($test(' + expr(s.test) + ')) {\n' + (s.then.t === 'Block' ? emitBlockPlain(s.then) : stmtPlain(s.then)) + '\n}';
        if (s.else) out += ' else ' + (s.else.t === 'If' ? stmtPlain(s.else) : '{\n' + (s.else.t === 'Block' ? emitBlockPlain(s.else) : stmtPlain(s.else)) + '\n}');
        return out;
      }
      case 'While': return 'while ($test(' + expr(s.test) + ')) {\n' + bodyPlain(s.body) + '\n}';
      case 'For': {
        const init = s.init == null ? '' : s.init.t === 'Let' ? 'let ' + s.init.decls.map((d) => d.name + ' = ' + expr(d.init)).join(', ') : expr(s.init);
        return 'for (' + init + '; ' + (s.test ? expr(s.test) : '') + '; ' + (s.update ? expr(s.update) : '') + ') {\n' + bodyPlain(s.body) + '\n}';
      }
      case 'ForOf': return 'for (const ' + s.name + ' of $iter(' + expr(s.iter) + ')) {\n' + bodyPlain(s.body) + '\n}';
      case 'Block': return '{\n' + emitBlockPlain(s) + '\n}';
      case 'Try': {
        return 'try {\n' + emitBlockPlain(s.block) + '\n} catch (__e) { const ' + s.param + ' = $catch(__e);\n' + emitBlockPlain(s.catchBlock) + '\n}';
      }
      default: throw new Error('codegen:未知语句 ' + s.t);
    }
  }

  function bodyPlain(s) {
    return s.t === 'Block' ? emitBlockPlain(s) : stmtPlain(s);
  }

  function classMethods(s) {
    const parts = [];
    if (s.ctor) parts.push('["constructor", function (' + paramsOf(s.ctor) + ') {\n' + emitBlockPlain(s.ctor.body) + '\n}]');
    for (const m of s.methods) parts.push('[' + quote(m.name) + ', function (' + paramsOf(m) + ') {\n' + emitBlockPlain(m.body) + '\n}]');
    return parts.join(', ');
  }

  function paramsOf(fn) {
    return fn.params.map((p) => p.name + (p.default ? ' = ' + expr(p.default) : '')).join(', ');
  }

  return { expr, base };
}

/* ============ 程序 → ES 模块产物 ============ */

export function generate(ast, opts = {}) {
  const globalNames = opts.globals ?? [];
  const { expr } = makeExprEmitter();
  const pad = (n) => IND.repeat(n);

  function blockBody(block, ind, top) {
    return '{\n' + block.body.map((s) => stmt(s, ind + 1, top)).join('\n') + '\n' + pad(ind) + '}';
  }

  function classDecl(s, ind) {
    const fields = s.fields.map((f) =>
      '[' + quote(f.name) + ', ' + (f.init ? 'function () { return ' + expr(f.init) + '; }' : 'null') + ']'
    ).join(', ');
    const methods = [];
    if (s.ctor) methods.push('["constructor", ' + methodFn(s.ctor) + ']');
    for (const m of s.methods) methods.push('[' + quote(m.name) + ', ' + methodFn(m) + ']');
    return pad(ind) + 'let ' + s.name + ' = $class(' + quote(s.name) + ', [' + fields + '], [' + methods.join(', ') + ']);';
  }

  function methodFn(m) {
    const params = m.params.map((p) => p.name + (p.default ? ' = ' + expr(p.default) : '')).join(', ');
    return 'function (' + params + ') ' + blockBody(m.body, 0, false);
  }

  function asBlock(s, ind, top) {
    if (s.t === 'Block') return blockBody(s, ind, top);
    return '{\n' + stmt(s, ind + 1, top) + '\n' + pad(ind) + '}';
  }

  function stmt(s, ind, top) {
    const p = pad(ind);
    switch (s.t) {
      case 'Let':
        return p + s.kind + ' ' + s.decls.map((d) => d.name + ' = ' + expr(d.init)).join(', ') + ';';
      case 'Class': return classDecl(s, ind);
      case 'Func': return p + 'function ' + s.name + '(' + paramsOfTop(s) + ') ' + blockBody(s.body, ind, false);
      case 'ExprStmt': return p + (top ? '$r = ' + expr(s.expr) + ';' : expr(s.expr) + ';');
      case 'If': {
        let out = p + 'if ($test(' + expr(s.test) + ')) ' + asBlock(s.then, ind, top);
        if (s.else) {
          out += s.else.t === 'If' ? ' else ' + stmt(s.else, ind, top) : ' else ' + asBlock(s.else, ind, top);
        }
        return out;
      }
      case 'While': return p + 'while ($test(' + expr(s.test) + ')) ' + asBlock(s.body, ind, top);
      case 'For': {
        const init = s.init == null ? '' :
          s.init.t === 'Let' ? 'let ' + s.init.decls.map((d) => d.name + ' = ' + expr(d.init)).join(', ') : expr(s.init);
        const test = s.test ? ' ' + expr(s.test) + ' ' : ' ';
        const update = s.update ? ' ' + expr(s.update) : '';
        return p + 'for (' + init + ';' + test + ';' + update + ') ' + asBlock(s.body, ind, top);
      }
      case 'ForOf':
        return p + 'for (const ' + s.name + ' of $iter(' + expr(s.iter) + ')) ' + asBlock(s.body, ind, top);
      case 'Block': return p + blockBody(s, ind, top);
      case 'Return': return p + 'return' + (s.expr ? ' ' + expr(s.expr) : '') + ';';
      case 'Throw': return p + 'throw ' + expr(s.expr) + ';';
      case 'Break': return p + 'break;';
      case 'Continue': return p + 'continue;';
      case 'Try': {
        const raw = '$__e';
        return p + 'try ' + blockBody(s.block, ind, top) +
          ' catch (' + raw + ') {\n' + pad(ind + 1) + 'let ' + s.param + ' = $catch(' + raw + ');\n' +
          s.catchBlock.body.map((x) => stmt(x, ind + 1, top)).join('\n') + '\n' + pad(ind) + '}';
      }
      default: throw new Error('codegen:未知语句 ' + s.t);
    }
  }

  function paramsOfTop(fn) {
    return fn.params.map((p) => p.name + (p.default ? ' = ' + expr(p.default) : '')).join(', ');
  }

  const body = ast.body.map((s) => stmt(s, 1, true)).join('\n');

  return [
    '// AetherJS v0.2 编译产物 —— 由受验证 AST 逐节点重建,禁止手工修改后注入(规格 B.1)',
    '// 加载方式:浏览器 Blob URL 动态 import / Node data: URL(规格 B.2,非 eval)',
    'export default function (AETHER) {',
    '  var $get = AETHER.get, $set = AETHER.set, $len = AETHER.setLen;',
    '  var $call = AETHER.call, $mcall = AETHER.mcall, $new = AETHER.news, $class = AETHER.cls, $catch = AETHER.catchErr;',
    '  var $test = AETHER.test, $bool = AETHER.bool, $not = AETHER.not, $iter = AETHER.iter, $obj = AETHER.obj;',
    '  var $add = AETHER.add, $sub = AETHER.sub, $mul = AETHER.mul, $div = AETHER.div, $mod = AETHER.mod, $pow = AETHER.pow;',
    '  var $band = AETHER.band, $bor = AETHER.bor, $bxor = AETHER.bxor, $bnot = AETHER.bnot;',
    '  var $shl = AETHER.shl, $shr = AETHER.shr, $shru = AETHER.shru, $neg = AETHER.neg;',
    '  var $lt = AETHER.lt, $le = AETHER.le, $gt = AETHER.gt, $ge = AETHER.ge;',
    ...globalNames.map((n) => '  var ' + n + ' = AETHER.g.' + n + ';'),
    '  var $r;',
    body,
    '  return $r;',
    '}',
  ].join('\n') + '\n';
}
