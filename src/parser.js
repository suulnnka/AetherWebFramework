/**
 * AetherJS v0.2 语法分析(规格第 3、5、7 节)→ AST。
 *
 * 与 v0.1 的结构性差异:
 * - 赋值只出现在语句位与 for 头;表达式位置一律 parseExpr(无赋值)
 *   → `if (x = 1)`、`a = b = 1` 天然是语法错
 * - let/const 必须初始化;class 声明(字段/constructor/方法,this 上下文判定);
 *   try-catch 必须绑定;无 switch/do-while/finally/空语句/var
 * - `==`/`!=`/一元 `+` 给出定向报错;constructor 禁带值 return
 */

import { parseErr } from './errors.js';

/* 二元运算符优先级(数值越大结合越紧) */
const PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '|': 3, '^': 4, '&': 5,
  '===': 6, '!==': 6, '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<<': 8, '>>': 8, '>>>': 8,
  '+': 9, '-': 9,
  '*': 10, '/': 10, '%': 10,
  '**': 11,
};

const ASSIGN_OPS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '**=',
  '&=', '|=', '^=', '<<=', '>>=', '>>>=',
]);

const UNARY_WORDS = new Set(['-', '!', '~']);

export function parse(tokens) {
  let pos = 0;
  let loopDepth = 0;
  let ctorDepth = 0;      // constructor 体内禁带值 return
  let thisOK = 0;         // >0:当前处于类成员体(箭头词法穿透,普通函数中断)

  const peek = (k = 0) => tokens[Math.min(pos + k, tokens.length - 1)];
  const next = () => tokens[pos++];
  const at = (type, value) => {
    const t = peek();
    return t.type === type && (value === undefined || t.value === value);
  };
  const eat = (type, value) => (at(type, value) ? next() : null);
  const fail = (msg, tok = peek()) => { throw parseErr(msg, tok.line, tok.col); };
  const expectSemi = () => {
    if (eat('p', ';')) return;
    const t = peek();
    fail(`应为 ";"(AetherJS 不做自动分号插入)${t.type === 'eof' ? '(文件末尾)' : `(意外的标记 "${t.value}")`}`);
  };

  /* ============ 语句 ============ */

  function parseProgram() {
    const body = [];
    while (!at('eof')) body.push(parseStatement());
    return { t: 'Program', body };
  }

  function parseStatement() {
    const tok = peek();
    if (tok.type === 'p') {
      if (tok.value === ';') fail('空语句不存在(规格 13)');
      if (tok.value === '{') return parseBlock();
      return parseExprOrAssignStatement();
    }
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'let': case 'const': {
          const kind = next().value;
          const node = parseLetDecl(kind);
          expectSemi();
          return node;
        }
        case 'function': return parseFunction();
        case 'class': return parseClass();
        case 'if': return parseIf();
        case 'while': return parseWhile();
        case 'for': return parseFor();
        case 'break': {
          next(); expectSemi();
          if (loopDepth === 0) fail('break 只能出现在循环内', tok);
          return { t: 'Break', line: tok.line };
        }
        case 'continue': {
          next(); expectSemi();
          if (loopDepth === 0) fail('continue 只能出现在循环内', tok);
          return { t: 'Continue', line: tok.line };
        }
        case 'return': {
          next();
          const hasExpr = !at('p', ';');
          if (hasExpr && ctorDepth > 0) fail('constructor 禁止带值 return(规格 7.2)', tok);
          const expr = hasExpr ? parseExpr() : null;
          expectSemi();
          return { t: 'Return', expr, line: tok.line };
        }
        case 'throw': {
          next();
          const expr = parseExpr();
          expectSemi();
          return { t: 'Throw', expr, line: tok.line };
        }
        case 'try': return parseTry();
        case 'new': case 'this': case 'true': case 'false': case 'null':
          break; // 表达式起始,走语句尾
      }
    }
    return parseExprOrAssignStatement();
  }

  function parseExprOrAssignStatement() {
    const tok = peek();
    const expr = parseAssignExpr();
    expectSemi();
    if (expr.t === 'Assign' || expr.t === 'Update') return { t: 'ExprStmt', expr, line: tok.line };
    return { t: 'ExprStmt', expr, line: tok.line };
  }

  function parseBlock() {
    const open = expectP('{', '"{"');
    const body = [];
    while (!at('p', '}')) {
      if (at('eof')) fail('块未闭合');
      body.push(parseStatement());
    }
    next();
    return { t: 'Block', body, line: open.line };
  }

  function expectP(value, what) {
    if (at('p', value)) return next();
    const t = peek();
    fail(`应为 ${what ?? `"${value}"`}${t.type === 'eof' ? '(文件末尾)' : `(意外的标记 "${t.value}")`}`);
  }

  /** let/const 声明(不含分号;for-of 由 parseFor 单独处理);必须初始化 */
  function parseLetDecl(kind) {
    const kw = peek();
    const decls = [];
    for (;;) {
      const idTok = expectID('变量名');
      expectP('=', '"="(let/const 声明必须初始化,规格 5)');
      const init = parseExpr();
      decls.push({ name: idTok.value, init, line: idTok.line });
      if (!eat('p', ',')) break;
    }
    return { t: 'Let', kind, decls, line: kw.line };
  }

  /** function 声明(名字必填)或函数表达式(名字可选,文法 ID?) */
  function parseFunction(requireName = true) {
    const kw = next(); // function
    let name = null;
    if (at('id')) name = next().value;
    else if (requireName) fail('函数声明必须有名字', kw);
    const params = parseParams();
    const saved = thisOK; thisOK = 0;
    const body = parseBlock();
    thisOK = saved;
    return { t: 'Func', name, params, body, line: kw.line };
  }

  function parseParams(what = '参数名') {
    expectP('(', '"("');
    const params = [];
    const seen = new Set();
    while (!at('p', ')')) {
      const idTok = expectID(what);
      if (seen.has(idTok.value)) fail(`参数 "${idTok.value}" 重复`, idTok);
      seen.add(idTok.value);
      let dflt = null;
      if (eat('p', '=')) dflt = parseExpr();
      params.push({ name: idTok.value, default: dflt });
      if (!eat('p', ',')) break;
      if (at('p', ')')) break; // 尾逗号
    }
    expectP(')', '")"');
    return params;
  }

  /* ---- class(规格 7) ---- */

  function parseClass() {
    const kw = next();
    const nameTok = expectID('类名');
    expectP('{', '"{"');
    const fields = [];
    const methods = [];
    let ctor = null;
    const seen = new Set();
    while (!eat('p', '}')) {
      if (at('eof')) fail('class 未闭合');
      const idTok = expectID('成员名');
      const name = idTok.value;
      if (name === 'constructor') {
        if (at('p', '(')) {
          if (ctor) fail('每个类至多一个 constructor(规格 7.2)', idTok);
          if (seen.has(name)) fail(`类成员 "${name}" 重复`, idTok);
          seen.add(name);
          const params = parseParams();
          const saved = thisOK; thisOK = 1;
          const savedCtor = ctorDepth; ctorDepth = 1;
          const body = parseBlock();
          ctorDepth = savedCtor; thisOK = saved;
          ctor = { params, body, line: idTok.line };
          continue;
        }
        fail('constructor 不能作为字段名(规格 7.2)', idTok);
      }
      if (seen.has(name)) fail(`类成员 "${name}" 重复(字段/方法重名)`, idTok);
      seen.add(name);
      if (at('p', '(')) {
        const params = parseParams();
        const saved = thisOK; thisOK = 1;
        const body = parseBlock();
        thisOK = saved;
        methods.push({ name, params, body, line: idTok.line });
      } else if (eat('p', '=')) {
        const saved = thisOK; thisOK = 1;
        const init = parseExpr();
        thisOK = saved;
        expectSemi();
        fields.push({ name, init, line: idTok.line });
      } else if (eat('p', ';')) {
        fields.push({ name, init: null, line: idTok.line });
      } else {
        const t = peek();
        fail(`类成员 "${name}" 后应为 ( = 或 ;(方法/字段/getter 与简写不支持,规格 7.2)`, t);
      }
    }
    return { t: 'Class', name: nameTok.value, fields, methods, ctor, line: kw.line };
  }

  function parseIf() {
    const kw = next();
    expectP('(', '"("');
    const test = parseExpr();
    expectP(')', '")"');
    const then = parseStatement();
    let els = null;
    if (eat('kw', 'else')) els = parseStatement();
    return { t: 'If', test, then, else: els, line: kw.line };
  }

  function parseWhile() {
    const kw = next();
    expectP('(', '"("');
    const test = parseExpr();
    expectP(')', '")"');
    loopDepth++;
    const body = parseStatement();
    loopDepth--;
    return { t: 'While', test, body, line: kw.line };
  }

  function parseFor() {
    const kw = next();
    expectP('(', '"("');
    let node;
    if (at('kw', 'let') || at('kw', 'const')) {
      const kindTok = next();
      const idTok = expectID('循环变量名');
      if (at('id', 'of')) {
        next();
        const iter = parseExpr();
        expectP(')', '")"');
        loopDepth++;
        const body = parseStatement();
        loopDepth--;
        node = { t: 'ForOf', kind: kindTok.value, name: idTok.value, iter, body, line: kw.line };
        return node;
      }
      // 经典 for:继续解析剩余声明符(必须初始化)
      expectP('=', '"="(for 头声明必须初始化)');
      const decls = [{ name: idTok.value, init: parseExpr(), line: idTok.line }];
      while (eat('p', ',')) {
        const d = expectID('变量名');
        expectP('=', '"="(for 头声明必须初始化)');
        decls.push({ name: d.value, init: parseExpr(), line: d.line });
      }
      expectP(';', '";"');
      node = finishFor(kw, { t: 'Let', kind: kindTok.value, decls, line: kindTok.line });
      return node;
    }
    if (!at('p', ';')) {
      const init = parseAssignExpr(); // for 头:唯一允许赋值的表达式槽
      expectP(';', '";"');
      return finishFor(kw, init);
    }
    next(); // 空 init 的 ';'
    return finishFor(kw, null);
  }

  function finishFor(kw, init) {
    const test = at('p', ';') ? null : parseExpr();
    expectP(';', '";"');
    const update = at('p', ')') ? null : parseAssignExpr();
    expectP(')', '")"');
    loopDepth++;
    const body = parseStatement();
    loopDepth--;
    return { t: 'For', init, test, update, body, line: kw.line };
  }

  function parseTry() {
    const kw = next();
    const block = parseBlock();
    let param = null;
    let catchBlock = null;
    if (eat('kw', 'catch')) {
      expectP('(', '"("(catch 必须绑定参数,规格 3)');
      const idTok = expectID('catch 参数名');
      expectP(')', '")"');
      param = idTok.value;
      catchBlock = parseBlock();
    } else {
      fail('try 后必须有 catch(规格 3,无 finally)', kw);
    }
    return { t: 'Try', block, param, catchBlock, line: kw.line };
  }

  function expectID(what) {
    if (at('id')) return next();
    const t = peek();
    // kw 出现在标识符位 → 大概率是被禁的关键字写法,给出上下文提示
    if (t.type === 'kw') fail(`${what}处是关键字 "${t.value}"`, t);
    fail(`应为 ${what}${t.type === 'eof' ? '(文件末尾)' : `(意外的标记 "${t.value}")`}`);
  }

  /* ============ 表达式 ============ */

  /** 语句位/for 头:允许一层赋值(右值不再允许赋值 → 链式赋值自然非法) */
  function parseAssignExpr() {
    const left = parseExpr();
    if (at('p') && ASSIGN_OPS.has(peek().value)) {
      const opTok = next();
      if (left.t !== 'Ident' && left.t !== 'Member' && left.t !== 'Index') {
        fail('赋值目标只能是变量或属性访问', opTok);
      }
      const value = parseExpr();
      return { t: 'Assign', op: opTok.value, target: left, value, line: opTok.line };
    }
    return left;
  }

  /** 表达式(无赋值、无逗号) */
  function parseExpr() {
    let left = parseBinary(0);
    if (at('p', '?')) {
      const tok = next();
      const then = parseExpr();
      expectP(':', '":"');
      const els = parseExpr();
      left = { t: 'Cond', test: left, then, else: els, line: tok.line };
    }
    return left;
  }

  function parseBinary(minPrec) {
    let left = parseUnary();
    for (;;) {
      const tok = peek();
      if (tok.type !== 'p') return left;
      const prec = PRECEDENCE[tok.value];
      if (prec === undefined || prec < minPrec) return left;
      if (tok.value === '==' || tok.value === '!=') {
        fail('禁止 == / !=(规格 13):请使用 === / !==', tok);
      }
      next();
      const right = tok.value === '**' ? parseBinary(prec) : parseBinary(prec + 1);
      left = { t: 'Binary', op: tok.value, l: left, r: right, line: tok.line };
    }
  }

  function parseUnary() {
    const tok = peek();
    if (tok.type === 'p' && (tok.value === '++' || tok.value === '--')) {
      next();
      const arg = parseUnary();
      checkUpdateTarget(arg, tok);
      return { t: 'Update', op: tok.value, arg, prefix: true, line: tok.line };
    }
    if (tok.type === 'p' && tok.value === '+') {
      fail('禁止一元 +(隐式转换运算符,规格 13):字符串转数字请用 num()', tok);
    }
    if (tok.type === 'p' && UNARY_WORDS.has(tok.value)) {
      next();
      const arg = parseUnary();
      return { t: 'Unary', op: tok.value, arg, line: tok.line };
    }
    return parsePostfix();
  }

  function checkUpdateTarget(arg, tok) {
    if (arg.t !== 'Ident' && arg.t !== 'Member' && arg.t !== 'Index') {
      fail('++/-- 的目标只能是变量或属性访问', tok);
    }
  }

  function parsePostfix() {
    const e = parseCallMember();
    if (at('p', '++') || at('p', '--')) {
      const tok = next();
      checkUpdateTarget(e, tok);
      return { t: 'Update', op: tok.value, arg: e, prefix: false, line: tok.line };
    }
    return e;
  }

  function parseCallMember() {
    let e = parsePrimary();
    for (;;) {
      if (eat('p', '.')) {
        const idTok = expectID('属性名');
        e = { t: 'Member', obj: e, prop: idTok.value, line: idTok.line };
      } else if (eat('p', '[')) {
        const key = parseExpr();
        expectP(']', '"]"');
        e = { t: 'Index', obj: e, key, line: key.line };
      } else if (eat('p', '(')) {
        const args = [];
        while (!at('p', ')')) {
          args.push(parseExpr());
          if (!eat('p', ',')) break;
          if (at('p', ')')) break;
        }
        expectP(')', '")"');
        e = { t: 'Call', callee: e, args, line: e.line };
      } else {
        return e;
      }
    }
  }

  function parsePrimary() {
    const tok = peek();
    if (tok.type === 'num') { next(); return { t: 'Num', value: tok.value, line: tok.line }; }
    if (tok.type === 'str') { next(); return { t: 'Str', value: tok.value, line: tok.line }; }
    if (tok.type === 'id') {
      if (peek(1).type === 'p' && peek(1).value === '=>') {
        next(); next();
        return finishArrow([{ name: tok.value, default: null }], tok.line);
      }
      next();
      return { t: 'Ident', name: tok.value, line: tok.line };
    }
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'true': next(); return { t: 'Bool', value: true, line: tok.line };
        case 'false': next(); return { t: 'Bool', value: false, line: tok.line };
        case 'null': next(); return { t: 'Null', line: tok.line };
        case 'this':
          if (thisOK === 0) fail('this 仅在类成员体及其内嵌箭头里合法(规格 3)', tok);
          next();
          return { t: 'This', line: tok.line };
        case 'function': return parseFunction(false);
        case 'new': {
          next();
          const target = parseMemberExpr();
          expectP('(', '"("(new 的实参括号必填,规格 7.2)');
          const args = [];
          while (!at('p', ')')) {
            args.push(parseExpr());
            if (!eat('p', ',')) break;
            if (at('p', ')')) break;
          }
          expectP(')', '")"');
          return { t: 'New', target, args, line: tok.line };
        }
      }
      fail(`关键字 "${tok.value}" 不能出现在表达式里`, tok);
    }
    if (tok.type === 'p') {
      if (tok.value === '(') return parseParenOrArrow();
      if (tok.value === '[') return parseArrayLit();
      if (tok.value === '{') return parseObjectLit();
    }
    fail(`应为表达式${tok.type === 'eof' ? '(文件末尾)' : `(意外的标记 "${tok.value}")`}`);
  }

  /** new 的目标:不带调用的后缀链 */
  function parseMemberExpr() {
    let e = parsePrimary();
    for (;;) {
      if (eat('p', '.')) {
        const idTok = expectID('属性名');
        e = { t: 'Member', obj: e, prop: idTok.value, line: idTok.line };
      } else if (eat('p', '[')) {
        const key = parseExpr();
        expectP(']', '"]"');
        e = { t: 'Index', obj: e, key, line: key.line };
      } else {
        return e;
      }
    }
  }

  function parseParenOrArrow() {
    const save = pos;
    try {
      const params = parseParams();
      expectP('=>', '"=>"');
      return finishArrow(params, peek().line);
    } catch (e) {
      if (!(e instanceof Error) || e.name !== 'CompileError') throw e;
      pos = save;
    }
    expectP('(', '"("');
    const e = parseExpr();
    expectP(')', '")"');
    return e;
  }

  function finishArrow(params, line) {
    let isExprBody = true;
    let body;
    if (at('p', '{')) {
      isExprBody = false;
      const saved = thisOK; // 箭头词法穿透 this(规格 3)
      body = parseBlock();
      thisOK = saved;
    } else {
      body = parseExpr();
    }
    return { t: 'Arrow', params, body, isExprBody, line };
  }

  function parseArrayLit() {
    const open = expectP('[', '"["');
    const items = [];
    while (!at('p', ']')) {
      if (at('p', ',')) fail('数组字面量不允许空洞(规格 13)', peek());
      items.push(parseExpr());
      if (!eat('p', ',')) break;
      if (at('p', ']')) break;
    }
    expectP(']', '"]"');
    return { t: 'Arr', items, line: open.line };
  }

  function parseObjectLit() {
    const open = expectP('{', '"{"');
    const props = [];
    const seen = new Set();
    while (!at('p', '}')) {
      const keyTok = peek();
      let key;
      if (keyTok.type === 'id') { next(); key = keyTok.value; }
      else if (keyTok.type === 'str') { next(); key = keyTok.value; }
      else fail(`对象键应为标识符或字符串(数字键已禁,规格 13)`, keyTok);
      if (seen.has(key)) fail(`对象键 "${key}" 重复(规格 13)`, keyTok);
      seen.add(key);
      expectP(':', '":"(对象只支持 键: 值;方法/getter/简写不支持)');
      const value = parseExpr();
      props.push({ key, value, line: keyTok.line });
      if (!eat('p', ',')) break;
      if (at('p', '}')) break;
    }
    expectP('}', '"}"');
    return { t: 'Obj', props, line: open.line };
  }

  return parseProgram();
}
