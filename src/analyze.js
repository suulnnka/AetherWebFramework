/**
 * AetherJS v0.2 静态校验(规格第 5 节)。
 *
 * 作用域规则只有三条:
 * 1. 函数声明在其所在函数/程序内提升(唯一例外)
 * 2. let/const/class 先声明后用 —— 静态 TDZ
 * 3. 白名单全局不可赋值、不可遮蔽
 */

import { analyzeErr } from './errors.js';

/** 白名单内建(规格第 8 节,与 runtime.js 的 SAFE_INTRINSICS 一一对应) */
export const DEFAULT_GLOBALS = [
  'Math', 'JSON',
  'NaN', 'Infinity', 'undefined',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat',
  'typeOf', 'str', 'num', 'keys', 'eq', 'copy', 'merge', 'fixed',
];

export function analyze(program, extraGlobals = []) {
  const whitelist = new Set([...DEFAULT_GLOBALS, ...extraGlobals]);
  const stack = []; // { decls: Map<name, kind> },函数边界标记 hoistable

  const fail = (msg, node) => { throw analyzeErr(msg, node); };
  const top = () => stack[stack.length - 1];

  function resolve(name) {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].decls.has(name)) return stack[k].decls.get(name);
    }
    return whitelist.has(name) ? 'global' : null;
  }

  function use(name, node) {
    const kind = resolve(name);
    if (kind === null) {
      fail(`未声明的标识符 "${name}"(AetherJS 只能使用本程序声明的名字与白名单全局)`, node);
    }
    return kind;
  }

  /** 声明 let/const/class/param:白名单不可遮蔽;同作用域不可重复 */
  function declare(name, kind, node) {
    if (whitelist.has(name)) {
      fail(`禁止遮蔽白名单全局 "${name}"(规格 5)`, node);
    }
    const scope = top();
    if (scope.decls.has(name)) {
      fail(`重复声明 "${name}"(同一作用域)`, node);
    }
    scope.decls.set(name, kind);
  }

  /** 函数声明提升:扫语句树(下钻控制流,不下钻函数) */
  function hoist(stmts) {
    const scope = top();
    const walk = (list) => {
      for (const s of list) {
        switch (s.t) {
          case 'Func': scope.decls.set(s.name, 'function'); break;
          case 'Block': walk(s.body); break;
          case 'If': walk([s.then]); if (s.else) walk([s.else]); break;
          case 'While': walk([s.body]); break;
          case 'For': if (s.init) walk([s.init]); walk([s.body]); break;
          case 'ForOf': walk([s.body]); break;
          case 'Try':
            walk(s.block.body);
            if (s.catchBlock) walk(s.catchBlock.body);
            break;
        }
      }
    };
    walk(stmts);
  }

  /* ---- 语句 ---- */

  function walkStmt(s) {
    switch (s.t) {
      case 'Let':
        for (const d of s.decls) {
          walkExpr(d.init);
          declare(d.name, s.kind, d);
        }
        break;
      case 'Class': {
        walkClass(s);
        declare(s.name, 'class', s); // class 不提升:先走成员(成员体内引用类名合法),再声明
        break;
      }
      case 'Func': walkFunction(s.name, s.params, s.body); break;
      case 'ExprStmt': walkExpr(s.expr); break;
      case 'If': walkExpr(s.test); walkStmt(s.then); if (s.else) walkStmt(s.else); break;
      case 'While': walkExpr(s.test); walkStmt(s.body); break;
      case 'For': {
        stack.push({ decls: new Map() });
        if (s.init) {
          if (s.init.t === 'Let') walkStmt(s.init);
          else walkExpr(s.init);
        }
        if (s.test) walkExpr(s.test);
        if (s.update) walkExpr(s.update);
        stack.push({ decls: new Map() });
        walkStmt(s.body);
        stack.pop(); stack.pop();
        break;
      }
      case 'ForOf': {
        stack.push({ decls: new Map() });
        walkExpr(s.iter);
        declare(s.name, s.kind === 'const' ? 'const' : 'let', s);
        stack.push({ decls: new Map() });
        walkStmt(s.body);
        stack.pop(); stack.pop();
        break;
      }
      case 'Block':
        stack.push({ decls: new Map() });
        for (const st of s.body) walkStmt(st);
        stack.pop();
        break;
      case 'Return': if (s.expr) walkExpr(s.expr); break;
      case 'Throw': walkExpr(s.expr); break;
      case 'Break': case 'Continue': break;
      case 'Try': {
        walkStmt(s.block);
        stack.push({ decls: new Map() });
        top().decls.set(s.param, 'let');
        walkStmt(s.catchBlock);
        stack.pop();
        break;
      }
      default: fail(`内部错误:未知语句 ${s.t}`, s);
    }
  }

  /** class 成员体走一遍(字段初始化/constructor/方法),类名已在.enclosing 声明后可见 —— 此处先声明再走成员 */
  function walkClass(s) {
    stack.push({ decls: new Map() });
    top().decls.set(s.name, 'class'); // 类体内引用自身(如 new 自身)合法
    for (const f of s.fields) if (f.init) walkExpr(f.init);
    if (s.ctor) walkFunction('constructor', s.ctor.params, s.ctor.body);
    for (const m of s.methods) walkFunction(m.name, m.params, m.body);
    stack.pop();
  }

  function walkFunction(name, params, body) {
    stack.push({ decls: new Map() });
    if (name) top().decls.set(name, 'function'); // 具名函数表达式:名字自引用
    for (const p of params) {
      if (p.default) walkExpr(p.default);
      declare(p.name, 'param', p.default ?? p);
    }
    hoist(body.body);
    for (const st of body.body) walkStmt(st);
    stack.pop();
  }

  /* ---- 表达式 ---- */

  function walkExpr(e) {
    switch (e.t) {
      case 'Num': case 'Str': case 'Bool': case 'Null': case 'This': break;
      case 'Ident': use(e.name, e); break;
      case 'Arr': for (const x of e.items) walkExpr(x); break;
      case 'Obj': for (const p of e.props) walkExpr(p.value); break;
      case 'Member': walkExpr(e.obj); break;
      case 'Index': walkExpr(e.obj); walkExpr(e.key); break;
      case 'Call': walkExpr(e.callee); for (const a of e.args) walkExpr(a); break;
      case 'New': walkExpr(e.target); for (const a of e.args) walkExpr(a); break;
      case 'Unary': walkExpr(e.arg); break;
      case 'Update':
        if (e.arg.t === 'Ident') {
          if (use(e.arg.name, e.arg) === 'const') fail(`不能修改 const "${e.arg.name}"`, e.arg);
        } else {
          walkExpr(e.arg);
        }
        break;
      case 'Binary': walkExpr(e.l); walkExpr(e.r); break;
      case 'Cond': walkExpr(e.test); walkExpr(e.then); walkExpr(e.else); break;
      case 'Assign':
        if (e.target.t === 'Ident') {
          const kind = use(e.target.name, e.target);
          if (kind === 'const') fail(`不能给 const "${e.target.name}" 赋值`, e.target);
          if (kind === 'global') fail(`不能给白名单全局 "${e.target.name}" 赋值(规格 5)`, e.target);
        } else {
          walkExpr(e.target);
        }
        walkExpr(e.value);
        break;
      case 'Func': walkFunction(e.name, e.params, e.body); break;
      case 'Arrow': {
        stack.push({ decls: new Map() });
        for (const p of e.params) {
          if (p.default) walkExpr(p.default);
          declare(p.name, 'param', p.default ?? p);
        }
        if (e.isExprBody) walkExpr(e.body);
        else {
          hoist(e.body.body);
          for (const st of e.body.body) walkStmt(st);
        }
        stack.pop();
        break;
      }
      default: fail(`内部错误:未知表达式 ${e.t}`, e);
    }
  }

  stack.push({ decls: new Map() });
  hoist(program.body);
  for (const s of program.body) walkStmt(s);
  stack.pop();
}

/**
 * 模板表达式校验(规格 16.2:插值复用 AetherJS 表达式编译)。
 * 在给定自由变量绑定集内校验一棵表达式 AST。
 */
export function analyzeExprWithBindings(exprAst, bindings) {
  const scope = { decls: new Map() };
  for (const b of bindings) scope.decls.set(b, 'let');
  const whitelist = new Set(DEFAULT_GLOBALS);

  const use = (name, node) => {
    if (!scope.decls.has(name) && !whitelist.has(name)) {
      throw analyzeErr(`模板表达式引用了未知变量 "${name}"(可见:${[...bindings].join(', ')})`, node);
    }
  };
  const walk = (e) => {
    switch (e.t) {
      case 'Ident': use(e.name, e); break;
      case 'Arr': e.items.forEach(walk); break;
      case 'Obj': e.props.forEach((p) => walk(p.value)); break;
      case 'Member': walk(e.obj); break;
      case 'Index': walk(e.obj); walk(e.key); break;
      case 'Call': walk(e.callee); e.args.forEach(walk); break;
      case 'New': failNoClass(e);
      case 'Unary': walk(e.arg); break;
      case 'Update': walk(e.arg); break;
      case 'Binary': walk(e.l); walk(e.r); break;
      case 'Cond': walk(e.test); walk(e.then); walk(e.else); break;
      case 'Func': case 'Arrow': case 'This':
        throw analyzeErr('模板插值必须是简单表达式(不允许函数定义/this/new)', e);
      default: break;
    }
  };
  const failNoClass = (e) => { throw analyzeErr('模板插值不允许 new', e); };
  walk(exprAst);
}
