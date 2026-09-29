/**
 * AetherJS v0.2 伪后端路由(规格 16.7)—— 平台侧实现。
 *
 * Django 风格纯数据路由表:domain / subdomain / port / path / script / template,
 * 外加 condition(进度条件):
 *   - 值为 AetherJS 严格表达式串,复用语言编译器编译(白名单/严格类型/零 eval,
 *     与模板插值同一条管线,规格 16.2);禁调用/new/赋值等副作用语法,是纯数据谓词
 *   - 表达式里的裸标识符一律解析为 progress 的键(仅 undefined/NaN/Infinity 保留
 *     字面含义);缺键读得 undefined(读取宽松),运算严格照旧
 *   - 挂载期编译校验;分发期求值结果必须是 boolean,否则视为不成立
 *   - 求值抛错(混型比较等类型错)→ 条件返回 false 并输出日志,不炸分发,
 *     路由继续向下匹配 —— 不做隐式转换,数据类型问题在日志里大声暴露
 *
 * 分发按数组顺序扫描,先匹配先生效:domain → subdomain → port → path 全过才
 * 求值 condition;URL 命中而条件不成立 → 继续向下(支持叠层路由);
 * 同域 path:"*" 是兜底页;全部未命中 → 平台默认 404。
 *
 * 通配(均不捕获、均按序优先,更具体的规则应排在通配之前,由作者保证):
 *   - path 末段 *:前缀认领子树,/wiki/* 匹配 /wiki、/wiki/a/b 等全部;
 *     仅允许出现在末段(中段通配拒绝),/* 不合法(整域兜底请写 path: "*")
 *   - subdomain: "*":任意单级前缀(tenant.mygame.os 命中,a.b.x.os 多级不命中;
 *     裸域 host===domain 不命中 —— 它只属于省略 subdomain 的条目)
 */

import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { analyzeExprWithBindings } from './analyze.js';
import { makeExprEmitter } from './codegen.js';
import { AetherError, CompileError } from './errors.js';
import { compile, makeAether, importModule, snapshotOf } from './runtime.js';
import { compileTemplate, treeToHtml, withTemplateHelpers, checkHtml } from './template.js';

const ROUTE_FIELDS = new Set(['domain', 'subdomain', 'port', 'path', 'script', 'template', 'condition']);
const DOMAIN_RE = /^[A-Za-z0-9.-]+$/;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/; // 与内建 num() 同一语义
const KEEP_IDENTS = new Set(['progress', 'undefined', 'NaN', 'Infinity']);

const rerr = (msg) => new CompileError('syntax', msg, null, null);
const errText = (e) => (e instanceof AetherError ? `${e.kind}: ${e.message}` : (e?.message ?? String(e)));

/* ---------- condition:表达式 → 求值模块 ---------- */

/** 禁副作用语法:条件是纯数据谓词,连内建函数都不可调用 */
function banConditionNodes(e, src) {
  const bad = (what, node) => {
    throw rerr(`condition "${src}" 不允许 ${what}(仅数据比较与逻辑组合,第 ${node?.line ?? '?'} 行)`);
  };
  const walk = (e) => {
    switch (e.t) {
      case 'Call': bad('函数调用', e);
      case 'New': bad('new', e);
      case 'Func': case 'Arrow': bad('函数定义', e);
      case 'This': bad('this', e);
      case 'Update': bad('自增自减', e);
      case 'Assign': bad('赋值', e);
      case 'Binary': walk(e.l); walk(e.r); break;
      case 'Unary': walk(e.arg); break;
      case 'Cond': walk(e.test); walk(e.then); walk(e.else); break;
      case 'Member': walk(e.obj); break;
      case 'Index': walk(e.obj); walk(e.key); break;
      case 'Arr': e.items.forEach(walk); break;
      case 'Obj': e.props.forEach((p) => walk(p.value)); break;
      default: break; // Ident/Num/Str/Bool/Null
    }
  };
  walk(e);
}

/** 裸标识符 → progress 的成员访问(score → progress.score),递归保持结构 */
function rewriteProgressIdents(e) {
  switch (e.t) {
    case 'Ident':
      if (KEEP_IDENTS.has(e.name)) return e;
      return { t: 'Member', obj: { t: 'Ident', name: 'progress', line: e.line }, prop: e.name, line: e.line };
    case 'Member': return { ...e, obj: rewriteProgressIdents(e.obj) };
    case 'Index': return { ...e, obj: rewriteProgressIdents(e.obj), key: rewriteProgressIdents(e.key) };
    case 'Binary': return { ...e, l: rewriteProgressIdents(e.l), r: rewriteProgressIdents(e.r) };
    case 'Unary': return { ...e, arg: rewriteProgressIdents(e.arg) };
    case 'Cond': return { ...e, test: rewriteProgressIdents(e.test), then: rewriteProgressIdents(e.then), else: rewriteProgressIdents(e.else) };
    case 'Arr': return { ...e, items: e.items.map(rewriteProgressIdents) };
    case 'Obj': return { ...e, props: e.props.map((p) => ({ ...p, value: rewriteProgressIdents(p.value) })) };
    default: return e;
  }
}

/**
 * 编译条件表达式 → 渲染/求值模块源码(产物形态同语言与模板,规格 B.2)。
 * @returns {{code:string, load():Promise<Function>}}
 */
export function compileCondition(src) {
  if (typeof src !== 'string' || src.trim() === '') throw rerr('condition 必须是非空字符串');
  const ast = parse(tokenize(src + ';'));
  if (ast.body.length !== 1 || ast.body[0].t !== 'ExprStmt') {
    throw rerr(`condition "${src}" 必须是单个表达式`);
  }
  const e = ast.body[0].expr;
  banConditionNodes(e, src);
  const rewritten = rewriteProgressIdents(e);
  analyzeExprWithBindings(rewritten, ['progress']);
  const js = makeExprEmitter().expr(rewritten);
  const code = [
    '// AetherJS v0.2 路由条件产物(规格 16.7)—— 标识符解析为 progress 的键,禁止手改',
    'export default function (AETHER, progress) {',
    '  var $get = AETHER.get, $obj = AETHER.obj, $bool = AETHER.bool, $not = AETHER.not;',
    '  var $add = AETHER.add, $sub = AETHER.sub, $mul = AETHER.mul, $div = AETHER.div, $mod = AETHER.mod, $pow = AETHER.pow;',
    '  var $band = AETHER.band, $bor = AETHER.bor, $bxor = AETHER.bxor, $bnot = AETHER.bnot;',
    '  var $shl = AETHER.shl, $shr = AETHER.shr, $shru = AETHER.shru, $neg = AETHER.neg;',
    '  var $lt = AETHER.lt, $le = AETHER.le, $gt = AETHER.gt, $ge = AETHER.ge;',
    `  return (${js});`,
    '}',
  ].join('\n') + '\n';
  return { code, load: () => importModule(code) };
}

/** 求值一个已编译条件:结果必须 boolean;任何错误 → false(调用方记日志) */
function evalCondition(fn, condAether, progressSnap) {
  try {
    const v = fn(condAether, progressSnap);
    if (typeof v === 'boolean') return { ok: v, note: null };
    return { ok: false, note: `结果非 boolean(${typeof v})` };
  } catch (e) {
    return { ok: false, note: errText(e) };
  }
}

/* ---------- path pattern ---------- */

/**
 * '/level/<number:lv>/' → [{literal}, {param, number, name}];'/' → []
 * 末段 '*' → {star:true}(前缀认领);中段 '*' 或空前缀 '/*' 拒绝。
 */
function parsePathPattern(path, domain) {
  const segs = path.split('/').filter((s) => s !== '');
  const seen = new Set();
  const out = segs.map((s, i) => {
    if (s === '*') {
      if (i !== segs.length - 1) throw rerr(`path "${path}" 的 * 只能作末段前缀通配(如 /wiki/*)`);
      return { star: true };
    }
    const m = /^<((number:)?([A-Za-z_][A-Za-z0-9_]*))>$/.exec(s);
    if (!m) return { literal: s };
    const name = m[3];
    if (seen.has(name)) throw rerr(`路径参数 "${name}" 重复(域名 ${domain})`);
    seen.add(name);
    return { param: true, number: m[2] !== undefined, name };
  });
  if (out.length === 1 && out[0].star) {
    throw rerr(`path "/*" 与整域兜底等价,请写 path: "*"(且须作域名 ${domain} 下最后一条)`);
  }
  return out;
}

/* ---------- 挂载:校验 + 编译 ---------- */

/**
 * @param {Array} routes 纯数据路由表(规格 16.7 字段表)
 * @param {object} opts
 *   loadScript(name)→source   script 文件名 → 源码(异步可选)
 *   loadTemplate(name)→source  模板文件名 → 源码(异步可选)
 *   hostGlobals {}             处理函数可见的宿主能力(如 print;仅内联执行路径使用)
 *   runScript {load, call}     处理函数执行器(如 Worker 后端,规格 18 轮):
 *                              load(source) 挂载期编译+验证;call(source, args, progress)
 *                              返回处理函数结果。提供时忽略 hostGlobals 与内联路径
 *   notFoundTemplate           平台默认 404 模板源码(可覆盖)
 *   log(msg)                   dev 日志(条件求值错误、渲染失败等;默认 console.warn)
 * @returns {{dispatch(url, progress):Promise<{status,html,tree,route,args,data}>}}
 */
export async function mountRouter(routes, opts = {}) {
  if (!Array.isArray(routes)) throw rerr('路由表必须是数组(纯数据,规格 16.7)');
  const log = opts.log ?? ((m) => console.warn('[router]', m));

  const loadScript = opts.loadScript ?? null;
  const loadTemplate = opts.loadTemplate ?? null;

  const compiled = [];
  for (const raw of routes) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw rerr('路由条目必须是对象');
    for (const k of Object.keys(raw)) {
      if (!ROUTE_FIELDS.has(k)) throw rerr(`未知字段 "${k}"(允许:${[...ROUTE_FIELDS].join(' ')})`);
    }
    if (typeof raw.domain !== 'string' || !DOMAIN_RE.test(raw.domain)) {
      throw rerr(`domain 必填且为域名/IP 形式,实际 ${JSON.stringify(raw.domain)}`);
    }
    if (raw.subdomain !== undefined) {
      if (typeof raw.subdomain !== 'string') throw rerr('subdomain 必须是字符串');
      if (raw.subdomain !== '*' && !/^[A-Za-z0-9-]+$/.test(raw.subdomain)) {
        throw rerr(`subdomain "${raw.subdomain}" 必须是单级标签或 "*"(多级前缀请逐条声明)`);
      }
    }
    if (raw.port !== undefined && (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535)) {
      throw rerr(`port 必须是 1..65535 整数,实际 ${JSON.stringify(raw.port)}`);
    }
    if (typeof raw.path !== 'string' || raw.path === '') {
      throw rerr('path 必填(以 / 开头,或作域名兜底的 *)');
    }
    const isStar = raw.path === '*';
    if (!isStar && !raw.path.startsWith('/')) {
      throw rerr(`path "${raw.path}" 必须以 / 开头`);
    }

    // condition:挂载期编译(语法/禁用语法/白名单错在此暴露)
    let conditionFn = null;
    if (raw.condition !== undefined) {
      conditionFn = (await compileCondition(raw.condition).load()).default;
    }

    // script:载入源码;经 runScript 执行器(Worker 后端)或内联模块执行
    let scriptMod = null;
    let scriptSrc = null;
    if (raw.script !== undefined) {
      if (typeof raw.script !== 'string') throw rerr('script 必须是文件名字符串');
      const src = loadScript ? await loadScript(raw.script) : null;
      if (typeof src !== 'string') {
        throw rerr(`script "${raw.script}" 无法载入(挂载校验:文件必须存在,规格 16.7)`);
      }
      if (opts.runScript) {
        scriptSrc = src;
        await opts.runScript.load(src); // Worker 侧编译 + 验证程序返回函数
      } else {
        const prog = compile(src, { globals: Object.keys(opts.hostGlobals ?? {}) });
        scriptMod = await prog.load();
        const probe = scriptMod.default(makeAether(snapshotOf(opts.hostGlobals ?? {})));
        if (typeof probe !== 'function') {
          throw rerr(`script "${raw.script}" 的程序返回值必须是函数(16.7 处理函数契约)`);
        }
      }
    }

    // template:文件名(以 .html 结尾,经 loadTemplate)或内联源码;全部过白名单编译
    const tpls = Array.isArray(raw.template) ? raw.template : [raw.template];
    if (tpls.length === 0) throw rerr('template 不能为空');
    const tplMods = [];
    for (const t of tpls) {
      if (typeof t !== 'string') throw rerr('template 必须是文件名或内联模板源码串(列表则由函数选索引)');
      const src = t.endsWith('.html') ? (loadTemplate ? await loadTemplate(t) : null) : t;
      if (typeof src !== 'string') {
        throw rerr(`模板 "${t}" 无法载入(需提供 loadTemplate,或改用内联模板源码)`);
      }
      tplMods.push(await importModule(compileTemplate(src)));
    }

    compiled.push({
      raw, domain: raw.domain.toLowerCase(), subdomain: raw.subdomain,
      port: raw.port, rawPath: raw.path, path: isStar ? '*' : parsePathPattern(raw.path, raw.domain),
      condition: raw.condition, conditionFn, scriptSrc, scriptMod, tplMods,
    });
  }

  // path:"*" 仅可作同域名下最后一条(挂载校验,规格 16.7)
  for (let i = 0; i < compiled.length; i++) {
    if (compiled[i].path !== '*') continue;
    for (let j = i + 1; j < compiled.length; j++) {
      if (compiled[j].domain === compiled[i].domain) {
        throw rerr(`path:"*" 只能作域名 ${compiled[i].domain} 下最后一条(兜底,规格 16.7)`);
      }
    }
  }

  const notFoundMod = await importModule(compileTemplate(
    opts.notFoundTemplate ?? '<h1>404</h1><p>页面不存在:未命中路由,或条件均不成立。</p>',
  ));

  const condAether = makeAether(Object.create(null)); // 条件求值:零宿主能力,纯只读
  const hostSnapshot = () => makeAether(snapshotOf(opts.hostGlobals ?? {}));

  /* ---------- 匹配(纯字符串部分) ---------- */

  const DEFAULT_PORTS = { 'http:': 80, 'https:': 443 };
  const splitPath = (p) => p.split('/').filter((s) => s !== '');

  function matchEntry(r, u) {
    const host = u.hostname.toLowerCase();
    if (host === r.domain) {
      if (r.subdomain !== undefined) return null; // 声明了 subdomain 却没有前缀(含 "*":裸域不属于它)
    } else if (host.endsWith('.' + r.domain)) {
      const prefix = host.slice(0, host.length - r.domain.length - 1);
      if (r.subdomain === undefined) return null;
      // "*":任意单级前缀(多级前缀 a.b 不命中);具体标签:精确相等
      if (r.subdomain === '*' ? prefix.includes('.') : prefix !== r.subdomain) return null;
    } else {
      return null;
    }
    // port:省略 = 默认端口;写了精确相等(规格 16.7)
    const urlPort = u.port === '' ? (DEFAULT_PORTS[u.protocol] ?? 80) : Number(u.port);
    const routePort = r.port ?? (DEFAULT_PORTS[u.protocol] ?? 80);
    if (urlPort !== routePort) return null;

    const args = {};
    for (const [k, v] of u.searchParams) if (!(k in args)) args[k] = v;
    if (r.path === '*') return { args };
    const segs = splitPath(u.pathname);
    const star = r.path.length > 0 && r.path[r.path.length - 1].star === true;
    const fixed = star ? r.path.length - 1 : r.path.length; // 前缀认领:末段 * 之后的余段忽略(不捕获)
    if (star ? segs.length < fixed : segs.length !== fixed) return null;
    for (let i = 0; i < fixed; i++) {
      const pat = r.path[i];
      if (pat.param) {
        if (pat.number) {
          if (!NUM_RE.test(segs[i])) return null; // 数字参数不匹配 → 整条不命中
          args[pat.name] = Number(segs[i]);
        } else {
          args[pat.name] = segs[i];
        }
      } else if (pat.literal !== segs[i]) {
        return null;
      }
    }
    return { args };
  }

  /* ---------- 渲染与兜底 ---------- */

  /** 处理函数返回值形状校验(16.7:{ template: 索引, data: 数据 }) */
  function applyHandlerResult(out, r) {
    if (out === null || typeof out !== 'object') {
      throw rerr('处理函数返回值不合法(须为 { template: 索引, data: 数据 })');
    }
    if (!Number.isInteger(out.template) || out.template < 0 || out.template >= r.tplMods.length) {
      throw rerr(`模板索引越界:${JSON.stringify(out.template)}(列表长度 ${r.tplMods.length})`);
    }
    if (out.data !== undefined && (out.data === null || typeof out.data !== 'object')) {
      throw rerr('data 必须是对象');
    }
  }

  async function renderRoute(r, args, progressSnap) {
    let idx = 0;
    let data = {};
    if (r.scriptSrc !== null) {
      // Worker 后端执行器(规格 18 轮):args/progress 克隆入,结果克隆出
      const out = await opts.runScript.call(r.scriptSrc, args, progressSnap);
      applyHandlerResult(out, r);
      idx = out.template;
      data = out.data ?? {};
    } else if (r.scriptMod) {
      const entry = r.scriptMod.default(hostSnapshot());
      const out = entry(args, progressSnap);
      applyHandlerResult(out, r);
      idx = out.template;
      data = out.data ?? {};
    }
    const tree = await r.tplMods[idx].default(withTemplateHelpers(makeAether(Object.create(null))), data);
    const html = treeToHtml(tree);
    const check = checkHtml(html); // 16.4 第 1 层:DOMParser 复检(浏览器生效)
    if (check.ok === false) throw new AetherError('access', `渲染复检未过:${check.violations.join('; ')}`);
    return { status: 200, html, tree, route: r.raw, args, data };
  }

  async function notFound() {
    const tree = await notFoundMod.default(withTemplateHelpers(makeAether(Object.create(null))), {});
    return { status: 404, html: treeToHtml(tree), tree, route: null, args: {}, data: {} };
  }

  /* ---------- 分发:按序短路,先匹配先生效 ---------- */

  async function dispatch(url, progress = {}) {
    const u = url instanceof URL ? url : new URL(url);
    const snap = snapshotOf(progress ?? {});
    for (const r of compiled) {
      const m = matchEntry(r, u);
      if (!m) continue;
      if (r.conditionFn) {
        const { ok, note } = evalCondition(r.conditionFn, condAether, snap);
        if (!ok) {
          if (note) log(`路由 ${r.domain}${r.rawPath} 条件 "${r.condition}" ${note},视为不成立,继续向下匹配`);
          continue;
        }
      }
      try {
        return await renderRoute(r, m.args, snap);
      } catch (e) {
        // 命中后渲染失败 → 平台默认 404(规格 16.7;条件不成立才会向下落)
        log(`路由 ${r.domain}${r.rawPath} 渲染失败 → 404:${errText(e)}`);
        return notFound();
      }
    }
    return notFound();
  }

  return { dispatch, routeCount: compiled.length };
}
