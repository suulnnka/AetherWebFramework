/**
 * AetherJS v0.2 词法分析(规格第 3 节)。
 *
 * 相比 v0.1 的关键变化:
 * - 关键字只剩:let const function class if else while for of break continue
 *   return throw try catch new this true false null
 * - do/switch/case/default/finally/var/typeof 不再是关键字(部分直接进禁字表)
 * - this/new 是上下文关键字:词法放行,合法性由 parser 按位置判
 * - `==`/`!=`/一元`+`/展开/空值合并保留 token,由 parser 给出定向报错
 * - 标识符纯 ASCII、无 $;null 原型查表(历史教训:v0.1 的 constructor 事故)
 */

import { lexErr } from './errors.js';

export const KEYWORDS = new Set([
  'let', 'const', 'function', 'class',
  'if', 'else', 'while', 'for', 'break', 'continue',
  'return', 'throw', 'try', 'catch',
  'new', 'this',
  'true', 'false', 'null',
]);

/**
 * 禁字 —— 出现即编译错并说明理由(规格第 13 节禁用总表)。
 * null 原型对象:查表键来自用户源码。
 */
export const BANNED_WORDS = Object.assign(Object.create(null), {
  eval: '禁止 eval:动态执行代码不在 AetherJS 能力范围内',
  Function: '禁止 Function 构造器:它是 eval 的等价物',
  arguments: '禁止 arguments:请用具名参数改写',
  delete: '禁止 delete:属性删除不做(可赋 undefined 替代)',
  void: '禁止 void 运算符',
  in: '禁止 in 运算符(含 for-in):请用下标循环或 for-of',
  instanceof: '禁止 instanceof:类型判断请用 typeOf()',
  extends: '禁止 extends:没有继承(规格 7.2),复用用组合',
  super: '禁止 super:没有继承',
  import: '禁止 import:不能引入外部代码',
  export: '禁止 export:AetherJS 脚本是单段程序',
  require: '禁止 require:不能引入外部代码',
  async: '禁止 async/await:AetherJS 程序是同步的',
  await: '禁止 async/await:AetherJS 程序是同步的',
  yield: '禁止 yield:没有生成器',
  with: '禁止 with:作用域魔法',
  debugger: '禁止 debugger',
  static: '保留字,不可用(本轮无 static 成员)',
  enum: '保留字,不可用',
  var: '禁止 var:只有 let/const,且必须初始化(规格 5)',
  typeof: '禁止 typeof 运算符(null 的历史错位):请用 typeOf()',
  do: '禁止 do-while(规格第 13 节):用 while 改写',
  switch: '禁止 switch(规格第 13 节):用 if-else 链改写',
});

/* 多字符运算符长者优先 */
const PUNCTUATORS = [
  '>>>=', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '==', '!=', '<=', '>=', '&&', '||', '??', '++', '--', '+=', '-=', '*=',
  '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**', '=>', '...',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '?', ':', ';', ',',
  '(', ')', '[', ']', '{', '}', '.', '&', '|', '^',
];

const ILLEGAL_HINTS = {
  '`': '模板字符串不支持(规格 13):请用 + 拼接',
  '#': '非法字符 #(私有字段不支持)',
  '@': '非法字符 @(装饰器不支持)',
};

function isIdStart(c) { return /[A-Za-z_]/.test(c); }
function isIdPart(c) { return /[A-Za-z0-9_]/.test(c); }
function isDigit(c) { return /[0-9]/.test(c); }
function isHexDigit(c) { return /[0-9a-fA-F]/.test(c); }

/** 源码 → token 数组;非法输入抛 CompileError(syntax) */
export function tokenize(src) {
  if (typeof src !== 'string') throw lexErr('源码必须是字符串', 1, 1);
  const toks = [];
  let i = 0, line = 1, lineStart = 0;

  const colOf = (idx) => {
    const s = src.lastIndexOf('\n', idx - 1);
    return idx - (s < 0 ? -1 : s);
  };
  const err = (msg, l = line, c = i - lineStart + 1) => { throw lexErr(msg, l, c); };
  const push = (type, value, startIdx) =>
    toks.push({ type, value, line, col: colOf(startIdx) });
  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; lineStart = i + 1; }
      i++;
    }
  };

  while (i < src.length) {
    const start = i;
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(); continue; }

    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const startLine = line;
      adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= src.length) err('未闭合的块注释', startLine, colOf(start));
      adv(2); continue;
    }

    /* 数字:十进制 / 0x / 0b / 0o / 指数;无前导点、无数字分隔符 */
    if (isDigit(c)) {
      let text = '', radix = 10;
      if (c === '0') {
        const n1 = src[i + 1];
        if (n1 === 'x' || n1 === 'X') radix = 16;
        else if (n1 === 'b' || n1 === 'B') radix = 2;
        else if (n1 === 'o' || n1 === 'O') radix = 8;
        else if (isDigit(n1)) err('不支持旧式八进制(请写 0o 前缀)', line, colOf(i));
        if (radix !== 10) {
          adv(2);
          const okDigit = radix === 16 ? isHexDigit
            : radix === 2 ? (ch) => ch === '0' || ch === '1'
              : (ch) => ch >= '0' && ch <= '7';
          while (i < src.length && okDigit(src[i])) text += src[i++];
          if (!text) err('进制字面量不完整', line, colOf(start));
          if (i < src.length && isIdStart(src[i])) err(`数字后意外字符 "${src[i]}"`, line, colOf(i));
          push('num', parseInt(text, radix), start);
          continue;
        }
      }
      while (i < src.length && isDigit(src[i])) text += src[i++];
      if (src[i] === '.' && isDigit(src[i + 1])) {
        text += '.'; i++;
        while (i < src.length && isDigit(src[i])) text += src[i++];
      }
      if (src[i] === 'e' || src[i] === 'E') {
        let j = i + 1;
        if (src[j] === '+' || src[j] === '-') j++;
        if (!isDigit(src[j])) err('指数不完整', line, colOf(i));
        text += src.slice(i, j + 1); i = j + 1;
        while (i < src.length && isDigit(src[i])) text += src[i++];
      }
      if (i < src.length && isIdStart(src[i])) err(`数字后意外字符 "${src[i]}"`, line, colOf(i));
      push('num', Number(text), start);
      continue;
    }

    /* 标识符 / 关键字 */
    if (isIdStart(c)) {
      let text = '';
      while (i < src.length && isIdPart(src[i])) text += src[i++];
      if (text.includes('$')) err('标识符不允许包含 $(编译产物保留)', line, colOf(start));
      if (KEYWORDS.has(text)) push('kw', text, start);
      else if (BANNED_WORDS[text]) err(BANNED_WORDS[text], line, colOf(start));
      else push('id', text, start); // of/constructor/this 之外的上下文字按普通标识符
      continue;
    }

    /* 字符串:\n \t \r \b \f \v \0 \' \" \\ \xNN \uXXXX */
    if (c === '"' || c === "'") {
      adv();
      let text = '';
      while (i < src.length && src[i] !== c) {
        const ch = src[i];
        if (ch === '\n') err('字符串字面量未闭合(换行前)', line, colOf(start));
        if (ch === '\\') {
          adv();
          const e = src[i];
          if (e === 'n') text += '\n';
          else if (e === 't') text += '\t';
          else if (e === 'r') text += '\r';
          else if (e === 'b') text += '\b';
          else if (e === 'f') text += '\f';
          else if (e === 'v') text += '\v';
          else if (e === '0') text += '\0';
          else if (e === "'" || e === '"' || e === '\\') text += e;
          else if (e === 'x') {
            adv();
            const h = src.slice(i, i + 2);
            if (!/^[0-9a-fA-F]{2}$/.test(h)) err('\\x 转义需要两位十六进制', line, colOf(i));
            text += String.fromCharCode(parseInt(h, 16)); adv();
          } else if (e === 'u') {
            adv();
            const h = src.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) err('\\u 转义需要四位十六进制', line, colOf(i));
            text += String.fromCharCode(parseInt(h, 16)); adv(3);
          } else if (e === undefined) err('字符串字面量未闭合', line, colOf(start));
          else err(`不支持的转义 \\${e}`, line, colOf(i));
          adv();
        } else {
          if (ch.charCodeAt(0) < 0x20) err('字符串含未转义的控制字符', line, colOf(i));
          text += ch; adv();
        }
      }
      if (i >= src.length) err('字符串字面量未闭合', line, colOf(start));
      adv();
      push('str', text, start);
      continue;
    }

    /* 运算符 */
    let matched = null;
    for (const p of PUNCTUATORS) {
      if (src.startsWith(p, i)) { matched = p; break; }
    }
    if (matched) {
      if (matched === '...') err('不支持展开/剩余参数(...)(规格 13)', line, colOf(start));
      if (matched === '??' || matched === '??=' || matched === '&&=' || matched === '||=') {
        err('不支持空值合并/逻辑赋值运算符(规格 13)', line, colOf(start));
      }
      push('p', matched, start);
      adv(matched.length);
      continue;
    }

    const hint = ILLEGAL_HINTS[c];
    err(hint ?? `非法字符 "${c}"`, line, colOf(start));
  }

  push('eof', null, i);
  return toks;
}
