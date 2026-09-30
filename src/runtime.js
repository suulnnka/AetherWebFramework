/**
 * AetherJS v0.2 运行时(规格第 2、6、8、9、10 节)。
 *
 * 职责:
 * - 编译管线:tokenize → parse → analyze → generate(ES 模块产物)
 * - 加载:浏览器 Blob URL / Node data: URL 动态 import(规格 B.2,非 eval)
 * - AETHER 上下文:18 项白名单内建 + 类型分派属性策略 + 严格运算符助手
 * - 宿主边界:数据深拷贝快照(写入不回传)、函数按引用、异常字符串化
 */

import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { analyze, DEFAULT_GLOBALS } from './analyze.js';
import { generate } from './codegen.js';
import { AetherError, CompileError } from './errors.js';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const err = (kind, msg) => new AetherError(kind, msg);
const t = (kind, msg) => err(kind, msg);
const typeOfV = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const ty = typeof v;
  return ty === 'object' ? 'object' : ty; // number|string|boolean|undefined|function
};

/* ---------- 属性访问策略(规格 6:接收者类型分派) ---------- */

const STRING_METHODS = new Set([
  'slice', 'substring', 'indexOf', 'includes', 'split', 'replace', 'repeat',
  'toUpperCase', 'toLowerCase', 'trim', 'startsWith', 'endsWith',
  'charAt', 'charCodeAt', 'padStart', 'padEnd', 'concat',
]);

const ARRAY_METHODS = new Set([
  'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'indexOf', 'includes',
  'join', 'map', 'filter', 'reduce', 'forEach', 'sort', 'reverse', 'concat',
  'every', 'some', 'find',
]);

function getProp(o, k) {
  const ty = typeOfV(o);
  if (ty === 'string') {
    if (k === 'length') return o.length;
    if (STRING_METHODS.has(k)) return o[k];
    throw t('access', `字符串没有属性/方法 "${k}"(白名单外,规格 6)`);
  }
  if (ty === 'array') {
    if (k === 'length') return o.length;
    if (ARRAY_METHODS.has(k)) return o[k];
    if (typeof k === 'number') {
      if (!Number.isInteger(k)) throw t('range', `数组下标必须是整数,实际 ${k}`);
      if (k < 0) throw t('range', `负数下标 ${k} 不允许(规格 2)`);
      return o[k]; // 越界读 → undefined(规格 2)
    }
    throw t('access', `数组没有属性/方法 "${k}"(白名单外,规格 6)`);
  }
  if (ty === 'object') {
    return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  }
  if (ty === 'function') {
    throw t('access', '函数没有可访问属性(规格 6,class 的 prototype 同样不可达)');
  }
  throw t('access', `${ty} 类型的值没有属性 "${String(k)}"(规格 6)`);
}

function setProp(o, k, v) {
  const ty = typeOfV(o);
  if (ty === 'array') {
    if (k === 'length') return setLen(o, v);
    if (typeof k === 'number') {
      if (!Number.isInteger(k)) throw t('range', `数组下标必须是整数,实际 ${k}`);
      if (k < 0) throw t('range', `负数下标写入 ${k} 不允许(规格 2)`);
      if (k > o.length) throw t('range', `越界写入 ${k}(长度 ${o.length};数组无空洞,规格 2)`);
      o[k] = v;
      return v;
    }
    throw t('access', `数组不支持设置属性 "${String(k)}"(规格 6)`);
  }
  if (ty === 'object') {
    o[k] = v; // null 原型:纯自有键,无 setter 语义(规格 6)
    return v;
  }
  if (ty === 'string') throw t('type', '字符串是不可变值(规格 2)');
  throw t('access', `${ty} 类型的值不支持属性写入 "${String(k)}"(规格 6)`);
}

function setLen(a, n) {
  if (typeOfV(a) !== 'array') throw t('type', 'length 赋值仅接受数组');
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    throw t('range', `length 只能赋非负整数,实际 ${n}`);
  }
  if (n > a.length) throw t('range', `length 只能收缩(${a.length} → ${n} 会制造空洞,规格 2)`);
  a.length = n;
  return n;
}

/* ---------- 严格运算符(规格 4) ---------- */

function num2(op, a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw t('type', `运算符 ${op} 要求 number,实际 ${typeOfV(a)} / ${typeOfV(b)}`);
  }
}
function add(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (typeof a === 'string' && typeof b === 'string') return a + b;
  throw t('type', `运算符 + 要求同型(number+number 或 string+string),实际 ${typeOfV(a)} / ${typeOfV(b)}`);
}
function rel(op, a, b) {
  const ta = typeof a, tb = typeof b;
  if ((ta === 'number' && tb === 'number') || (ta === 'string' && tb === 'string')) {
    switch (op) {
      case '<': return a < b; case '<=': return a <= b;
      case '>': return a > b; default: return a >= b;
    }
  }
  throw t('type', `比较 ${op} 要求两 number 或两 string,实际 ${typeOfV(a)} / ${typeOfV(b)}`);
}
const test = (c) => {
  if (typeof c !== 'boolean') throw t('type', `条件须为 boolean,实际 ${typeOfV(c)}(规格 4)`);
  return c;
};
const bool = test;

/* ---------- class 机制(规格 7) ---------- */

const CLASS_REGISTRY = new WeakMap(); // classValue → { name, fields, methods, ctor }

function defineClass(name, fields, methodPairs) {
  const factory = function () {
    throw t('type', `类 ${name} 必须用 new 实例化(规格 7.2)`);
  };
  const methods = Object.create(null);
  for (const [k, fn] of methodPairs) methods[k] = fn;
  CLASS_REGISTRY.set(factory, { name, fields, methods, ctor: methods.constructor ?? null });
  return factory;
}

function construct(C, args) {
  const rec = CLASS_REGISTRY.get(C);
  if (!rec) throw t('type', 'new 的目标必须是 class(规格 7.2)');
  const inst = Object.create(null);
  for (const [fname, initFn] of rec.fields) {
    inst[fname] = initFn ? initFn.call(inst) : undefined;
  }
  for (const key of Object.keys(rec.methods)) {
    if (key === 'constructor') continue; // constructor 不落实例自有键(规格 7.2/7.3)
    inst[key] = rec.methods[key];
  }
  if (rec.ctor) rec.ctor.call(inst, ...args);
  return inst;
}

/* ---------- 白名单内建(规格 8,18 项) ---------- */

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function safeStringify(x) {
  // 环 → range;function/undefined 值按 JS 规则(键省略/数组位 null)
  let s;
  try { s = JSON.stringify(x); } catch { throw t('range', '环引用不能序列化(规格 8)'); }
  return s === undefined ? 'null' : s;
}

function nullProto(v) {
  if (Array.isArray(v)) return v.map(nullProto);
  if (v !== null && typeof v === 'object') {
    const o = Object.create(null);
    for (const k of Object.keys(v)) o[k] = nullProto(v[k]);
    return o;
  }
  return v;
}

function strOf(x) {
  switch (typeOfV(x)) {
    case 'number': return String(x);
    case 'string': return x;
    case 'boolean': return String(x);
    case 'null': return 'null';
    case 'undefined': return 'undefined';
    case 'function': return '<function>';
    default: return safeStringify(x);
  }
}

function numOf(s) {
  if (typeof s !== 'string') throw t('type', `num() 要求 string,实际 ${typeOfV(s)}`);
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN;
}

function keysOf(o) {
  if (typeOfV(o) !== 'object') throw t('type', `keys() 仅接受 object,实际 ${typeOfV(o)}`);
  return Object.keys(o);
}

function deepEq(a, b, seen) {
  if (a === b) return true;
  const ta = typeOfV(a), tb = typeOfV(b);
  if (ta !== tb) return false;
  if (ta === 'array') {
    if (seen.has(a, b)) return true; // 环安全:同一对再遇视为相等(规格 8)
    if (a.length !== b.length) return false;
    seen.add(a, b);
    for (let i = 0; i < a.length; i++) {
      if (!deepEq(a[i], b[i], seen)) return false;
    }
    return true;
  }
  if (ta === 'object') {
    if (seen.has(a, b)) return true;
    seen.add(a, b);
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!own(b, k) || !deepEq(a[k], b[k], seen)) return false;
    }
    return true;
  }
  return false; // number(NaN≠NaN 与 === 一致)、function(引用已判)、原始值(已判)
}

function eqBuiltin(a, b) {
  return deepEq(a, b, new PairSet());
}

/** 环安全的 (a,b) 配对集合 */
class PairSet {
  constructor() { this.m = new Map(); }
  has(a, b) {
    const s = this.m.get(a);
    return s ? s.has(b) : false;
  }
  add(a, b) {
    if (!this.m.has(a)) this.m.set(a, new Set());
    this.m.get(a).add(b);
  }
}

function deepCopy(x, map) {
  const ty = typeOfV(x);
  if (ty !== 'array' && ty !== 'object') return x; // 原始值/函数同引用(规格 8)
  if (map.has(x)) return map.get(x); // 环安全 + 共享保留(规格 8)
  const out = ty === 'array' ? [] : Object.create(null);
  map.set(x, out);
  if (ty === 'array') {
    for (let i = 0; i < x.length; i++) out[i] = deepCopy(x[i], map);
  } else {
    for (const k of Object.keys(x)) out[k] = deepCopy(x[k], map);
  }
  return out;
}

function copyBuiltin(x) {
  const ty = typeOfV(x);
  if (ty !== 'array' && ty !== 'object') {
    throw t('type', `copy() 接受 array/object,实际 ${ty}`);
  }
  return deepCopy(x, new Map());
}

/** 宿主数据 → 沙盒入界快照(深拷贝 null 原型、环安全;函数按引用,规格 10) */
export function snapshotOf(x) {
  return deepCopy(x, new Map());
}

function mergeBuiltin(a, b) {
  if (typeOfV(a) !== 'object' || typeOfV(b) !== 'object') {
    throw t('type', `merge() 要求两个 object,实际 ${typeOfV(a)} / ${typeOfV(b)}`);
  }
  const out = Object.create(null);
  for (const k of Object.keys(a)) out[k] = a[k];
  for (const k of Object.keys(b)) out[k] = b[k];
  return out;
}

function fixedBuiltin(x, n) {
  if (typeof x !== 'number') throw t('type', `fixed() 要求 number,实际 ${typeOfV(x)}`);
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100) {
    throw t('range', `fixed() 的小数位须为 0..100 整数,实际 ${n}`);
  }
  return x.toFixed(n);
}

const SAFE_INTRINSICS = {
  Math,
  JSON: {
    parse: (s) => nullProto(JSON.parse(s)),
    stringify: safeStringify,
  },
  parseInt: (s) => Number.parseInt(String(s), 10), // 恒十进制(规格 8)
  parseFloat: (s) => Number.parseFloat(String(s)),
  isNaN, isFinite,
  NaN, Infinity, undefined,
  typeOf: typeOfV,
  str: strOf,
  num: numOf,
  keys: keysOf,
  eq: eqBuiltin,
  copy: copyBuiltin,
  merge: mergeBuiltin,
  fixed: fixedBuiltin,
};

/* ---------- AETHER 上下文(每次执行一份) ---------- */

export function makeAether(hostSnapshot) {
  return {
    g: Object.assign(Object.create(null), SAFE_INTRINSICS, hostSnapshot),
    get: getProp,
    set: setProp,
    setLen,
    call: (f, args) => {
      if (typeof f !== 'function') throw t('type', `调用非函数值(实际 ${typeOfV(f)},规格 6)`);
      return f(...args);
    },
    mcall: (o, k, args) => {
      const f = getProp(o, k);
      if (typeof f !== 'function') throw t('type', `调用非函数值 "${String(k)}"(实际 ${typeOfV(f)},规格 6)`);
      return f.call(o, ...args); // 成员调用绑 this;箭头值自动忽略(与 JS 一致)
    },
    news: construct,
    cls: defineClass,
    catchErr: (e) => (e instanceof AetherError ? `${e.kind}: ${e.message}` : e),
    test, bool,
    not: (c) => {
      if (typeof c !== 'boolean') throw t('type', `运算符 ! 要求 boolean,实际 ${typeOfV(c)}`);
      return !c;
    },
    neg: (a) => { num2('一元 -', a, 0); return -a; },
    bnot: (a) => { num2('~', a, 0); return ~a; },
    add,
    sub: (a, b) => { num2('-', a, b); return a - b; },
    mul: (a, b) => { num2('*', a, b); return a * b; },
    div: (a, b) => { num2('/', a, b); return a / b; },
    mod: (a, b) => { num2('%', a, b); return a % b; },
    pow: (a, b) => { num2('**', a, b); return a ** b; },
    band: (a, b) => { num2('&', a, b); return a & b; },
    bor: (a, b) => { num2('|', a, b); return a | b; },
    bxor: (a, b) => { num2('^', a, b); return a ^ b; },
    shl: (a, b) => { num2('<<', a, b); return a << b; },
    shr: (a, b) => { num2('>>', a, b); return a >> b; },
    shru: (a, b) => { num2('>>>', a, b); return a >>> b; },
    lt: (a, b) => rel('<', a, b),
    le: (a, b) => rel('<=', a, b),
    gt: (a, b) => rel('>', a, b),
    ge: (a, b) => rel('>=', a, b),
    iter: (x) => {
      const ty = typeOfV(x);
      if (ty === 'array' || ty === 'string') return x;
      throw t('type', `for-of 仅接受数组与字符串,实际 ${ty}(对象请用 keys(),规格 8)`);
    },
    obj: (entries) => {
      const o = Object.create(null);
      for (const [k, v] of entries) o[k] = v;
      return o;
    },
  };
}

/* ---------- 编译与加载 ---------- */

/**
 * 编译一段 AetherJS 源码。
 * @returns {{code:string, globals:string[], load:() => Promise<Function>}}
 */
export function compile(source, opts = {}) {
  const extra = [...new Set([...DEFAULT_GLOBALS, ...(opts.globals ?? [])])];
  for (const n of extra) {
    if (!IDENT_RE.test(n)) throw err('syntax', `全局名 "${n}" 不是合法标识符`);
  }
  const ast = parse(tokenize(source));
  analyze(ast, opts.globals ?? []);
  const code = generate(ast, { globals: extra });
  return {
    code,
    globals: extra,
    /** 动态 import 加载产物模块 → 得到入口函数(浏览器 blob:,Node data:) */
    load: () => importModule(code),
  };
}

const IS_NODE = typeof window === 'undefined';
// 缓存键是源码字符串(原始值),WeakMap 只收对象键 —— 浏览器路径一跑
// 就抛 "Invalid value used as weak map key",改用 Map;模块一经 import()
// 常驻引擎模块表,blob URL 与之间生共死,缓存不算泄漏
const blobUrls = new Map();

export function importModule(code) {
  if (IS_NODE) {
    return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(code));
  }
  let url = blobUrls.get(code);
  if (!url) {
    url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    blobUrls.set(code, url);
  }
  return import(url);
}

/**
 * 常驻运行时(规格 10)。
 * 宿主全局:函数按引用注入,数据深拷贝为 null 原型快照(每次执行重建,写入不回传)。
 */
export function createRuntime(hostGlobals = {}, opts = {}) {
  const extra = Object.keys(hostGlobals).filter((n) => !DEFAULT_GLOBALS.includes(n));
  const cache = new Map();

  function compileCached(source) {
    if (cache.has(source)) return cache.get(source);
    const program = compile(source, { globals: extra });
    cache.set(source, program);
    return program;
  }

  /** 宿主值入界(规格 10):数据深拷贝 null 原型快照;函数包装 ——
   *  异常跨界字符串化为 AetherError(host, message)(stack/cause 不跨界),
   *  返回值中的数据同样深拷贝 */
  function wrapHostValue(v) {
    if (typeof v !== 'function') {
      return (v !== null && typeof v === 'object') ? deepCopy(v, new Map()) : v;
    }
    return function (...args) {
      let r;
      try {
        r = v(...args);
      } catch (e) {
        if (e instanceof AetherError) throw e; // 语言自身错误(如回调内)原样
        throw err('host', e?.message ?? String(e));
      }
      return (r !== null && typeof r === 'object') ? deepCopy(r, new Map()) : r;
    };
  }

  function snapshot() {
    const snap = Object.create(null);
    for (const [k, v] of Object.entries(hostGlobals)) {
      snap[k] = wrapHostValue(v);
    }
    return snap;
  }

  return {
    compile: (source) => compileCached(source),
    /** 编译(缓存)+ 加载 + 执行;返回程序值(顶层 return 或最后一条表达式) */
    async run(source) {
      const program = compileCached(source);
      const mod = await program.load();
      return mod.default(makeAether(snapshot()));
    },
    /** 用已加载的入口函数直接执行(跳过重复加载) */
    exec(entry) {
      return entry(makeAether(snapshot()));
    },
    clearCache() { cache.clear(); },
  };
}

export { AetherError, CompileError };
