/**
 * AetherJS v0.2 模板引擎(规格第 16 节)。
 *
 * 管线:模板源码 → 白名单文法解析 → IR → 渲染模块(ES module,
 * 与语言产物同形态,B.2 的 blob/data 加载)。
 * 语义:模板是程序不是字符串 —— 解析不了即编译错;文法严于 HTML
 * (属性引号强制、标签必须闭合、无注释/DOCTYPE/raw text)。
 *
 * 槽类型(16.3):
 *   文本槽   $esc($str(expr))    —— 转义 < &
 *   属性槽   $escA($str(expr))   —— 追加转义引号
 *   href/src $url($str(expr))    —— 校验非转义:仅相对路径
 *   style 值 $sty(属性, 值)      —— 属性级白名单 + 字符集校验
 */

import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { analyzeExprWithBindings } from './analyze.js';
import { makeExprEmitter, quote } from './codegen.js';
import { AetherError, CompileError } from './errors.js';
import { importModule } from './runtime.js';

/* ---------- 白名单(16.2,宿主可裁不可扩) ---------- */

export const TAGS = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'b', 'i', 'em', 'strong', 'br', 'a', 'img',
]);

const VOID_TAGS = new Set(['br', 'img']);

const GLOBAL_ATTRS = new Set(['class', 'id', 'title', 'style', 'ref']);
const TAG_ATTRS = { a: new Set(['href']), img: new Set(['src', 'alt']) };

/* 白名单校验(导出给 ui.js 复用 —— 单一事实来源,规格 16.2/16.3/16.6) */

export function checkAttr(tag, name) {
  if (name.startsWith('on')) return `禁止属性 ${name}(on* 一律不存在)`;
  if (GLOBAL_ATTRS.has(name)) return null;
  if (TAG_ATTRS[tag]?.has(name)) return null;
  if (name.startsWith('data-')) return null;
  return `属性 ${name} 不在白名单(标签 <${tag}>)`;
}

export function checkUrlValue(v) {
  if (typeof v !== 'string') return `URL 槽必须是 string`;
  // 在"浏览器规范化后的形态"上判定:URL 解析前会剔除首尾空白与 \t\n\r、把 \ 当 /,
  // 否则 " javascript:x"、"java\nscript:x"、"\\/evil.com" 可绕过(单一事实来源,规格 16.3)
  if (v.includes('\\')) return `URL 值不允许反斜杠 "${v}"(浏览器会当作路径分隔符)`;
  if (/[\u0000-\u001F\u007F]/.test(v)) return `URL 值不允许控制字符`;
  const norm = v.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(norm) || norm.startsWith('//')) {
    return `禁止外部资源 "${v}"(仅相对路径)`;
  }
  return null;
}

export function checkStyleProp(prop) {
  return STYLE_PROPS.has(prop) ? null : `style 属性 "${prop}" 不在白名单`;
}

export function checkStyleValue(prop, v) {
  if (typeof v !== 'string' || !STYLE_VALUE_RE.test(v)) {
    return `style 值含非法字符`;
  }
  if (/url\s*\(/i.test(v)) {
    return `style 值不允许 url()(禁外链即禁外传,规格 16.3)`;
  }
  return null;
}

export function checkClassToken(token) {
  return /^[A-Za-z0-9_-]+$/.test(token) ? null : `class 名 "${token}" 不合法(仅 [A-Za-z0-9_-])`;
}

/** style 属性白名单 + 值字符集(结构上封死 CSS 注入:无 ; : " ' url() 等字符) */
const STYLE_PROPS = new Set([
  'color', 'background', 'background-color', 'font-size', 'font-weight',
  'text-align', 'text-decoration', 'margin', 'padding', 'border',
  'border-radius', 'width', 'height', 'display', 'opacity',
  'line-height', 'letter-spacing',
]);
const STYLE_VALUE_RE = /^[0-9a-zA-Z#%.,()\s-]{1,100}$/;

/** URL 槽:仅相对路径(禁一切 scheme 与协议相对 //,16.3);判定逻辑与 checkUrlValue 单一来源 */
function urlSlot(v) {
  const bad = checkUrlValue(v);
  if (bad) throw new AetherError('access', bad);
  return v;
}

function styleVal(prop, v) {
  if (!STYLE_PROPS.has(prop)) {
    throw new AetherError('access', `style 属性 "${prop}" 不在白名单(规格 16.3)`);
  }
  if (typeof v !== 'string' || !STYLE_VALUE_RE.test(v)) {
    throw new AetherError('access', `style 属性 "${prop}" 的值含非法字符(规格 16.3)`);
  }
  return v;
}

const escTextV = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttrV = (s) => escTextV(s).replace(/"/g, '&quot;');

/* ---------- 模板解析:源码 → IR ---------- */

const tplErr = (msg, line) => new CompileError('syntax', msg, line ?? null, null);

/**
 * @returns {{t:'text', text}|{t:'slot', src}|{t:'if',test,then,else}|{t:'each',list,as,body}
 *           |{t:'el',tag,attrs,style,children}}
 */
export function parseTemplate(src) {
  if (typeof src !== 'string') throw tplErr('模板必须是字符串');
  let pos = 0, line = 1;

  const countLines = (upto) => src.slice(0, upto).split('\n').length;

  function err(msg, at = pos) {
    throw tplErr(`${msg}(第 ${countLines(at)} 行)`);
  }

  /** 解析片段序列,直到 endTag('}}' 块边界由调用方管理)/EOF/指定停止词 */
  function parseParts(stopWords) {
    const parts = [];
    let text = '';
    const flush = () => { if (text) { parts.push({ t: 'text', text }); text = ''; } };
    while (pos < src.length) {
      if (src.startsWith('{{', pos)) {
        flush();
        const item = parseMustache();
        if (item.stop) {
          if (stopWords && stopWords.includes(item.stop)) return { parts, stop: item.stop };
          err(`不预期的 {{${item.stop}}}`);
        }
        parts.push(item.node);
        continue;
      }
      if (src[pos] === '<') {
        const next = src[pos + 1];
        if (next === '/') {
          // 闭合标签:由元素解析器消费,这里只对顶层报错
          if (stopWords === null) err('多余的闭合标签');
          flush();
          return { parts, stop: 'CLOSE' };
        }
        flush();
        parts.push(parseElement());
        continue;
      }
      if (src[pos] === '\n') line++;
      text += src[pos++];
    }
    flush();
    if (stopWords) err(stopWords === null ? '' : `模板未闭合(等待 ${stopWords.join('/')})`);
    return { parts, stop: null };
  }

  /** {{...}}:表达式槽或块指令 */
  function parseMustache() {
    const start = pos;
    pos += 2;
    const end = src.indexOf('}}', pos);
    if (end < 0) err('{{ 未闭合', start);
    let inner = src.slice(pos, end).trim();
    pos = end + 2;
    if (inner === 'else') return { stop: 'else' };
    if (inner === '/if') return { stop: '/if' };
    if (inner === '/each') return { stop: '/each' };
    if (inner.startsWith('#if ')) {
      const test = inner.slice(4).trim();
      if (!test) err('#if 缺少表达式', start);
      const thenRes = parseParts(['else', '/if']);
      let els = [];
      if (thenRes.stop === 'else') {
        const elseRes = parseParts(['/if']);
        els = elseRes.parts;
      }
      return { node: { t: 'if', test, then: thenRes.parts, else: els } };
    }
    if (inner.startsWith('#each ')) {
      const m = /^#each\s+(.+?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(inner);
      if (!m) err('#each 语法:{{#each 表达式 as 变量}}', start);
      const bodyRes = parseParts(['/each']);
      return { node: { t: 'each', list: m[1], as: m[2], body: bodyRes.parts } };
    }
    if (inner.startsWith('#') || inner.startsWith('/')) err(`未知指令 {{${inner}}}`, start);
    if (!inner) err('空插值', start);
    return { node: { t: 'slot', src: inner } };
  }

  /** 元素:<tag attr="..">children</tag> 或 void/self-close */
  function parseElement() {
    const start = pos;
    pos++; // '<'
    const m = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(src.slice(pos));
    if (!m) err('标签名不合法', start);
    const tag = m[0];
    pos += tag.length;
    if (!TAGS.has(tag)) {
      err(`标签 <${tag}> 不在白名单(规格 16.2:仅 ${[...TAGS].slice(0, 8).join(' ')} …)`, start);
    }
    const attrs = [];   // {name, parts:[{t:'text'|'slot',...}]}
    let styleParts = null;
    let selfClose = false;
    // 属性
    for (;;) {
      skipSpace();
      if (src.startsWith('/>', pos)) { selfClose = true; pos += 2; break; }
      if (src[pos] === '>') { pos++; break; }
      if (pos >= src.length) err(`标签 <${tag}> 未闭合`, start);
      const am = /^([a-zA-Z-][a-zA-Z0-9-]*)/.exec(src.slice(pos));
      if (!am) err(`属性名不合法(标签 <${tag}>)`, pos);
      const name = am[0];
      pos += name.length;
      skipSpace();
      if (src[pos] !== '=') err(`属性 ${name} 必须带引号值(文法严于 HTML,规格 16.2)`, pos);
      pos++;
      skipSpace();
      const q = src[pos];
      if (q !== '"' && q !== "'") err(`属性 ${name} 的值必须加引号(规格 16.2)`, pos);
      pos++;
      const vend = src.indexOf(q, pos);
      if (vend < 0) err(`属性 ${name} 的值未闭合`, pos);
      const raw = src.slice(pos, vend);
      if (raw.includes('<')) err(`属性 ${name} 的值不允许包含 <`, pos);
      pos = vend + 1;
      if (name.startsWith('on')) err(`禁止属性 ${name}(on* 一律不存在,规格 16.2)`, start);
      if (name === 'style') {
        styleParts = parseStyleParts(raw, start);
        continue;
      }
      const allowed = GLOBAL_ATTRS.has(name) || (TAG_ATTRS[tag]?.has(name)) || name.startsWith('data-');
      if (!allowed) err(`属性 ${name} 不在白名单(规格 16.2)`, start);
      if ((name === 'href' || name === 'src') && !raw.includes('{{')) {
        const ub = checkUrlValue(raw); // 纯静态值编译期即拒(混合段由运行期整值校验兜底)
        if (ub) err(ub, start);
      }
      attrs.push({ name, parts: splitSlots(raw) });
    }
    if (VOID_TAGS.has(tag)) {
      if (!selfClose && src.startsWith(`</${tag}`, pos)) {
        pos = src.indexOf('>', pos) + 1;
      }
      return { t: 'el', tag, attrs, style: styleParts, children: [] };
    }
    if (selfClose) return { t: 'el', tag, attrs, style: styleParts, children: [] };
    const body = parseElementBody(tag);
    return { t: 'el', tag, attrs, style: styleParts, children: body };
  }

  function parseElementBody(tag) {
    const res = parseParts(['CLOSE']);
    // 消费 </tag>
    const m = new RegExp(`^</${tag}\\s*>`).exec(src.slice(pos));
    if (!m) err(`标签 <${tag}> 未正确闭合`, pos);
    pos += m[0].length;
    return res.parts;
  }

  function skipSpace() {
    while (pos < src.length && (src[pos] === ' ' || src[pos] === '\t' || src[pos] === '\n' || src[pos] === '\r')) {
      if (src[pos] === '\n') line++;
      pos++;
    }
  }

  /** 值文本 → 静态/槽交替序列 */
  function splitSlots(raw) {
    const parts = [];
    let i = 0, text = '';
    while (i < raw.length) {
      if (raw.startsWith('{{', i)) {
        const end = raw.indexOf('}}', i);
        if (end < 0) err('属性内的 {{ 未闭合');
        if (text) { parts.push({ t: 'text', text }); text = ''; }
        const inner = raw.slice(i + 2, end).trim();
        if (!inner || inner.startsWith('#') || inner.startsWith('/')) err('属性内只允许表达式插值');
        parts.push({ t: 'slot', src: inner });
        i = end + 2;
        continue;
      }
      text += raw[i++];
    }
    if (text) parts.push({ t: 'text', text });
    return parts;
  }

  /** style 值 → 属性级 IR:[{prop, parts}](16.3:不做字符串槽;静态值编译期校验字符集) */
  function parseStyleParts(raw, elStart) {
    const decls = [];
    for (const chunk of raw.split(';')) {
      const seg = chunk.trim();
      if (!seg) continue;
      const ci = seg.indexOf(':');
      if (ci < 0) err(`style 声明 "${seg}" 缺少冒号`, elStart);
      const prop = seg.slice(0, ci).trim();
      if (!STYLE_PROPS.has(prop)) err(`style 属性 "${prop}" 不在白名单(规格 16.3)`, elStart);
      if (seg.slice(ci + 1).includes(':')) err('style 值不允许包含冒号');
      const parts = splitSlots(seg.slice(ci + 1).trim());
      for (const p of parts) {
        if (p.t === 'text' && !STYLE_VALUE_RE.test(p.text)) {
          err(`style 属性 "${prop}" 的静态值含非法字符(规格 16.3)`, elStart);
        }
      }
      decls.push({ prop, parts });
    }
    return decls;
  }

  const { parts } = parseParts(null);
  return { t: 'tpl', parts };
}

/* ---------- IR 校验 + 表达式编译 → 渲染模块 ---------- */

function compileExprSrc(src, bindings) {
  const toks = tokenize(src + ';'); // 包成单语句程序解析
  const ast = parse(toks);
  if (ast.body.length !== 1 || ast.body[0].t !== 'ExprStmt') {
    throw tplErr(`插值 "${src}" 必须是单个表达式`);
  }
  const e = ast.body[0].expr;
  if (e.t === 'Func' || e.t === 'Arrow' || e.t === 'This' || e.t === 'New' || e.t === 'Update') {
    throw tplErr(`插值 "${src}" 不允许函数定义/this/new/自增(无副作用简单表达式)`);
  }
  analyzeExprWithBindings(e, bindings);
  return makeExprEmitter().expr(e);
}

function collectPartsIR(parts, bindings) {
  // 先递归收集绑定(each 引入新变量)
  for (const p of parts) {
    if (p.t === 'each') collectPartsIR(p.body, [...bindings, p.as]);
    else if (p.t === 'if') {
      collectPartsIR(p.then, bindings);
      collectPartsIR(p.else, bindings);
    } else if (p.t === 'el') {
      collectPartsIR(p.children, bindings);
    }
  }
}

/** IR → 渲染模块源码(ES module,产物形态同语言,规格 B.2) */
export function compileTemplate(src, opts = {}) {
  const ir = parseTemplate(src);
  const { expr } = makeExprEmitter();

  function slotCall(node, bindings, wrap) {
    const js = compileExprSrc(node.src, bindings);
    return wrap(js);
  }

  function attrValue(parts, bindings, wrap) {
    // 静态文本编译期转义;槽经运行时助手
    const segs = parts.map((p) =>
      p.t === 'text' ? quote(escTextV(p.text))
        : slotCall(p, bindings, wrap)
    );
    return segs.length === 0 ? "''" : segs.length === 1 ? segs[0] : '(' + segs.join(' + ') + ')';
  }

  function emitParts(parts, bindings, ind) {
    return '[' + parts.map((p) => emitPart(p, bindings, ind + 1)).filter(Boolean).join(', ') + ']';
  }

  function emitPart(p, bindings, ind) {
    switch (p.t) {
      case 'text':
        return p.text.trim() === '' ? null : quote(escTextV(p.text));
      case 'slot':
        return slotCall(p, bindings, (js) => `$esc($str(${js}))`);
      case 'if': {
        // 产出嵌套数组;treeToHtml 递归展平
        const cond = compileExprSrc(p.test, bindings);
        return `($test(${cond}) ? ${emitParts(p.then, bindings, ind)} : ${emitParts(p.else, bindings, ind)})`;
      }
      case 'each': {
        const listJs = compileExprSrc(p.list, bindings);
        const inner = bindings.concat(p.as);
        const bodyParts = emitParts(p.body, inner, ind + 1);
        return `((items) => { const out = []; for (const ${p.as} of $iter(items)) { out.push(...${bodyParts}); } return out; })(${listJs})`;
      }
      case 'el': {
        const attrEntries = p.attrs.map((a) => {
          if (a.name === 'href' || a.name === 'src') {
            // URL 槽:原始段拼接 → 整体校验($url:分段拼不出 scheme)→ 属性转义($escA:引号封死,
            // 值含 " 也越不出属性 —— html 字符串导出路径(如 serve.mjs)同样安全,规格 16.3)
            const segs = a.parts.map((p) =>
              p.t === 'text' ? quote(p.text) : slotCall(p, bindings, (js) => `$str(${js})`));
            const joined = segs.length === 0 ? "''" : segs.length === 1 ? segs[0] : '(' + segs.join(' + ') + ')';
            return `[${quote(a.name)}, $escA($url(${joined}))]`;
          }
          const wrap = (js) => `$escA($str(${js}))`;
          return `[${quote(a.name)}, ${attrValue(a.parts, bindings, wrap)}]`;
        });
        const styleEntries = (p.style ?? []).map((d) =>
          `[${quote(d.prop)}, ${attrValue(d.parts, bindings, (js) => `$sty(${quote(d.prop)}, $str(${js}))`)}]`
        );
        const children = emitParts(p.children, bindings, ind + 1);
        return `$obj([["tag", ${quote(p.tag)}], ["attrs", $obj([${attrEntries.join(', ')}])], ` +
          `["style", $obj([${styleEntries.join(', ')}])], ["children", ${children}]])`;
      }
      default: throw new Error('template codegen:未知片段 ' + p.t);
    }
  }

  collectPartsIR(ir.parts, opts.rootName ? [opts.rootName] : ['it']);
  const root = opts.rootName ?? 'it';
  const bindings0 = [root];
  const treeSrc = emitParts(ir.parts, bindings0, 0).slice(1, -1) // 顶层 parts 平铺
    ;
  // 顶层可能为空
  const treeExpr = treeSrc.trim() === '' ? '[]' : `[${treeSrc}]`;

  return [
    '// AetherJS v0.2 模板渲染产物(规格 16)—— 由白名单文法 IR 重建,禁止手改',
    `// 数据约定:根变量 ${root};挂载走 IR→DOM 或 DOMParser 复检(16.4),innerHTML 不经手`,
    'export default function (AETHER, ' + root + ') {',
    '  var $get = AETHER.get, $set = AETHER.set, $obj = AETHER.obj;',
    '  var $call = AETHER.call, $mcall = AETHER.mcall, $iter = AETHER.iter;',
    '  var $test = AETHER.test, $bool = AETHER.bool, $not = AETHER.not;',
    '  var $add = AETHER.add, $sub = AETHER.sub, $mul = AETHER.mul, $div = AETHER.div, $mod = AETHER.mod, $pow = AETHER.pow;',
    '  var $band = AETHER.band, $bor = AETHER.bor, $bxor = AETHER.bxor, $bnot = AETHER.bnot;',
    '  var $shl = AETHER.shl, $shr = AETHER.shr, $shru = AETHER.shru, $neg = AETHER.neg;',
    '  var $lt = AETHER.lt, $le = AETHER.le, $gt = AETHER.gt, $ge = AETHER.ge;',
    '  var $esc = AETHER.escText, $escA = AETHER.escAttr, $url = AETHER.urlSlot, $sty = AETHER.styleVal;',
    '  var $str = AETHER.g.str;',
    `  return ${treeExpr};`,
    '}',
  ].join('\n') + '\n';
}

/* ---------- 宿主侧:树 → HTML 文本(纯拼接,值已在构建期转义/校验) ---------- */

export function treeToHtml(nodes) {
  const one = (n) => {
    if (typeof n === 'string') return n; // 已转义(静态编译期/槽运行期)
    if (Array.isArray(n)) return n.map(one).join('');
    let attrs = '';
    for (const [k, v] of Object.entries(n.attrs)) attrs += ` ${k}="${v}"`;
    const style = Object.entries(n.style);
    if (style.length) attrs += ` style="${style.map(([p, v]) => `${p}: ${v}`).join('; ')}"`;
    if (VOID_TAGS.has(n.tag)) return `<${n.tag}${attrs}>`;
    return `<${n.tag}${attrs}>${n.children.map(one).join('')}</${n.tag}>`;
  };
  return (Array.isArray(nodes) ? nodes : [nodes]).map(one).join('');
}

/** 16.4 第 1 层:DOMParser 独立复检(浏览器环境;Node 下返回未检提示) */
export function checkHtml(html) {
  if (typeof DOMParser === 'undefined') {
    return { ok: true, note: 'Node 环境无 DOMParser,跳过复检(浏览器生效)' };
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bad = [];
  const walk = (el) => {
    if (!TAGS.has(el.tagName.toLowerCase())) bad.push(`标签 ${el.tagName}`);
    for (const a of el.attributes) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) bad.push(`属性 ${n}`);
      if (n === 'href' || n === 'src') {
        // 与 checkUrlValue 同一规范化形态复检(空白/控制字符/反斜杠不可绕过)
        const uv = a.value.replace(/[\t\n\r]/g, '').trim().replace(/\\/g, '/');
        if (/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uv) || uv.startsWith('//')) {
          bad.push(`外链 ${a.value}`);
        }
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(doc.body);
  return bad.length ? { ok: false, violations: bad } : { ok: true };
}

/* ---------- 模板运行时 ---------- */

/** 给 AETHER 上下文补模板助手(esc/url/style 槽规则) */
export function withTemplateHelpers(aether) {
  aether.escText = escTextV;
  aether.escAttr = escAttrV;
  aether.urlSlot = urlSlot;
  aether.styleVal = styleVal;
  return aether;
}

/**
 * 编译模板 → { code, load(): 渲染模块 }。
 * 渲染:(mod, data) => withTemplateHelpers(makeAether()) 注入后 mod.default(ctx, data)
 */
export async function renderTemplate(tplSrc, data, { makeAether, rootName } = {}) {
  const code = compileTemplate(tplSrc, { rootName });
  const mod = await importModule(code);
  const ctx = withTemplateHelpers(makeAether());
  const tree = await mod.default(ctx, data);
  return { tree, html: treeToHtml(tree), code };
}
