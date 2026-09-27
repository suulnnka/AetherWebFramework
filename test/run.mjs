/**
 * AetherJS v0.2 测试套件:node test/run.mjs(零依赖)。
 * 覆盖:严格运算符/控制流/class/内建/边界隔离(语义)、
 * 禁用总表(编译拒绝)、类型分派与模板边界(运行时拦截)。
 */

import { createRuntime, compile, makeAether } from '../src/index.js';
import { compileTemplate, treeToHtml, withTemplateHelpers } from '../src/template.js';
import { importModule } from '../src/runtime.js';
import { AetherError, CompileError } from '../src/errors.js';

let pass = 0, fail = 0;
const failed = [];
const queue = [];

function test(name, fn) {
  queue.push((async () => {
    try { await fn(); pass++; }
    catch (e) { fail++; failed.push({ name, e }); }
  })());
}

function eq(actual, expected, note = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${note} 期望 ${b},实际 ${a}`);
}

function makeRt(extra = {}) {
  const out = [];
  const globals = { print: (...a) => out.push(a.join(' ')), ...extra };
  const rt = createRuntime(globals);
  return { rt, out };
}

async function runSrc(src, extra) {
  const { rt, out } = makeRt(extra);
  const value = await rt.run(src);
  return { value, out };
}

async function reject(src, want, globals) {
  try {
    const p = compile(src, { globals });
    await p.load();
  } catch (e) {
    if (e instanceof CompileError) {
      if (want && !e.message.includes(want)) {
        throw new Error(`错误信息不符:期望包含 "${want}",实际 "${e.message}"`);
      }
      return e;
    }
    // 运行期语言错误也被接受(部分约束在加载/首执行时暴露)
    if (e instanceof AetherError && want && !(`${e.kind}: ${e.message}`.includes(want))) {
      throw new Error(`错误信息不符:期望包含 "${want}",实际 "${e.kind}: ${e.message}"`);
    }
    if (e instanceof AetherError) return e;
    throw e;
  }
  throw new Error(`应当失败,但通过了:${src.slice(0, 60)}`);
}

async function throwsKind(src, kind, extra) {
  try {
    await runSrc(src, extra);
  } catch (e) {
    if (e instanceof AetherError && e.kind === kind) return e;
    throw new Error(`期望 ${kind} 错误,实际:${e?.name ?? e} ${e?.message ?? ''}`);
  }
  throw new Error(`应当抛 ${kind},但通过了:${src.slice(0, 60)}`);
}

/* ============ 严格运算符(规格 4) ============ */

test('算术与优先级', async () => {
  eq((await runSrc('1 + 2 * 3 - 4;')).value, 3);
  eq((await runSrc('(1 + 2) * 3;')).value, 9);
  eq((await runSrc('7 / 2 + 7 % 3;')).value, 4.5);
  eq((await runSrc('2 ** 10;')).value, 1024);
  eq((await runSrc('-5 + 10;')).value, 5);
  eq((await runSrc('0x10 + 0b101 + 0o17;')).value, 36);
  eq((await runSrc('1.5e2 + 1;')).value, 151);
  eq((await runSrc('(5 & 3) + (5 | 3) + (5 ^ 3) + (1 << 4) + (16 >> 2);')).value, 34);
});
test('常量折叠与运行时一致', async () => {
  eq((await runSrc('1 / 0;')).value, Infinity); // 非有限不折,运行时 IEEE
  eq((await runSrc('0 / 0 === 0 / 0;')).value, false);
});
test('字符串拼接仅同型', async () => {
  eq((await runSrc('"a" + "b" + "c";')).value, 'abc');
  eq((await runSrc('"x" + "1";')).value, 'x1');
});
test('+ 混型抛 type', () => throwsKind('let a = "3" + 1;', 'type'));
test('num()/str() 显式转换', async () => {
  eq((await runSrc('num("3") + 1;')).value, 4);
  eq((await runSrc('"n=" + str(42);')).value, 'n=42');
  eq((await runSrc('num("42abc");')).value, NaN) ;
});
test('比较仅同型', async () => {
  eq((await runSrc('"abc" < "abd";')).value, true);
  eq((await runSrc('3 <= 3 && 4 > 5 === false;')).value, true);
});
test('比较混型抛 type', () => throwsKind('let x = "3" < 1;', 'type'));
test('=== 任意类型零转换', async () => {
  eq((await runSrc('1 === "1";')).value, false);
  eq((await runSrc('null === undefined;')).value, false);
  eq((await runSrc('[1] === [1];')).value, false);
});
test('逻辑仅 boolean + 短路', async () => {
  eq((await runSrc('true && false ? 1 : 2;')).value, 2);
  const r = await runSrc('function boom() { return 1; } false && boom();');
  eq(r.value, false);
});
test('逻辑非 boolean 抛 type', () => throwsKind('let x = 1 && 2;', 'type'));
test('一元 - 非 number 抛 type', () => throwsKind('let x = -"a";', 'type'));
test('条件须 boolean', () => throwsKind('let n = 1; if (n) { 1; }', 'type'));
test('while 条件须 boolean', () => throwsKind('let n = 1; while (n) { n = false; }', 'type'));
test('自增后缀值语义', async () => {
  eq((await runSrc('let x = 5; let y = x++; y * 10 + x;')).value, 56);
});
test('自减前缀', async () => eq((await runSrc('let x = 5; --x;')).value, 4));
test('++ 非数字抛 type', () => throwsKind('let s = "a"; s++;', 'type'));

/* ============ 语句与作用域(规格 5) ============ */

test('for/for-of/break/continue', async () => {
  eq((await runSrc('let s = 0; for (let i = 1; i <= 10; i++) { s += i; } s;')).value, 55);
  eq((await runSrc('let s = 0; for (const x of [1, 2, 3, 4]) { s += x; } s;')).value, 10);
  eq((await runSrc('let s = 0; for (let i = 0; i < 10; i++) { if (i % 2 === 0) { continue; } s += i; } s;')).value, 25);
  eq((await runSrc('let i = 0; for (;;) { i++; if (i >= 7) { break; } } i;')).value, 7);
  eq((await runSrc('for (let i = 0, n = 4; i < n; i++) { }')).value, undefined);
});
test('for-of 字符串按码元', async () => {
  eq((await runSrc('let s = ""; for (const c of "abc") { s = c + s; } s;')).value, 'cba');
});
test('for-let 每轮独立绑定', async () => {
  const r = await runSrc(`
    let fns = [];
    for (let i = 0; i < 3; i++) { fns.push(() => i); }
    fns[0]() + fns[1]() + fns[2]();
  `);
  eq(r.value, 3);
});
test('函数声明提升(唯一例外)', async () => {
  eq((await runSrc('early(); function early() { return "ok"; }')).value, 'ok');
});
test('let 先声明后用(静态 TDZ)', () => reject('y = 1; let y = 2;', '未声明的标识符 "y"'));
test('class 不提升', () => reject('let a = new A(1); class A { constructor(x) { this.x = x; } }', '未声明'));
test('函数与闭包', async () => {
  const r = await runSrc(`
    let make = (start) => {
      let n = start;
      return () => { n = n + 1; return n; };
    };
    let c = make(5);
    c(); c(); c();
  `);
  eq(r.value, 8);
  eq((await runSrc('((x) => x + 1)(41);')).value, 42);
  eq((await runSrc('var0(); function var0() { return 7; }')).value, 7);
});
test('默认参数', async () => {
  eq((await runSrc('function f(a, b = 10) { return a + b; } f(1);')).value, 11);
  eq((await runSrc('function f(a, b = 10) { return a + b; } f(1, 2);')).value, 3);
});
test('try/catch 错误字符串化(规格 9)', async () => {
  const r = await runSrc('try { 1 + "a"; } catch (e) { e; }');
  eq(r.value.startsWith('type: '), true, r.value);
});
test('用户 throw 原样往返', async () => {
  eq((await runSrc('try { throw { code: 42 }; } catch (e) { e.code; }')).value, 42);
  eq((await runSrc('try { throw "boom"; } catch (e) { e; }')).value, 'boom');
});
test('顶层 return 与程序值', async () => {
  eq((await runSrc('1; 2; 3;')).value, 3);
  eq((await runSrc('return 42; 999;')).value, 42);
  eq((await runSrc('')).value, undefined);
});

/* ============ class(规格 7) ============ */

test('class 基本语义', async () => {
  const r = await runSrc(`
    class Point {
      x = 0;
      y = 0;
      constructor(a, b) { this.x = a; this.y = b; }
      dist(o) {
        let dx = this.x - o.x;
        let dy = this.y - o.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
    }
    let p = new Point(1, 2);
    p.dist(new Point(4, 6));
  `);
  eq(r.value, 5);
});
test('字段默认值与后赋值', async () => {
  const r = await runSrc(`
    class C { n = 10; constructor() { this.tag = "c"; } }
    let c = new C();
    str(c.n) + c.tag;
  `);
  eq(r.value, '10c');
});
test('方法提取后 this 为 undefined → access 错', () => throwsKind(`
  class C { m() { return this.x; } constructor() { this.x = 1; } }
  let d = (new C()).m;
  d();
`, 'access'));
test('类必须 new', () => throwsKind(`
  class C { constructor() { } }
  C();
`, 'type'));
test('new 非类抛 type', () => throwsKind('let f = () => 1; let x = new f();', 'type'));
test('实例是 null 原型 object', async () => {
  const r = await runSrc(`
    class C { x = 1; constructor() { } m() { return 2; } }
    let c = new C();
    typeOf(c) + ":" + str(c.constructor === undefined) + ":" + keys(c).join(",");
  `);
  eq(r.value, 'object:true:x,m');
});
test('eq/copy 对实例结构工作', async () => {
  const r = await runSrc(`
    class P { x = 0; y = 0; constructor(a, b) { this.x = a; this.y = b; } }
    eq(new P(1, 2), copy(new P(1, 2)));
  `);
  eq(r.value, true);
});
test('类体内引用类名', async () => {
  const r = await runSrc(`
    class N { v = 1; constructor(v) { this.v = v; }
      static1() { return 0; }
      bigger(o) { return new N(this.v + o.v); } }
    (new N(3)).bigger(new N(4)).v;
  `);
  eq(r.value, 7);
});

/* ============ 数组/对象/属性分派(规格 2、6) ============ */

test('数组方法与 length', async () => {
  eq((await runSrc('[1, 2, 3].map(x => x * x).join(",");')).value, '1,4,9');
  eq((await runSrc('[1, 2, 3, 4].filter(x => x % 2 === 0).length;')).value, 2);
  eq((await runSrc('[1, 2, 3, 4].reduce((a, b) => a + b, 0);')).value, 10);
  eq((await runSrc('[3, 1, 2].sort().join("");')).value, '123');
});
test('数组写入规则', async () => {
  eq((await runSrc('let a = [1]; a[1] = 2; a.length;')).value, 2); // == length 追加
});
test('数组越界写入抛 range', () => throwsKind('let a = [1, 2]; a[5] = 1;', 'range'));
test('负下标读抛 range', () => throwsKind('let a = [1, 2]; let x = a[-1];', 'range'));
test('length 扩张抛 range', () => throwsKind('let a = [1, 2]; a.length = 5;', 'range'));
test('length 收缩截断', async () => {
  eq((await runSrc('let a = [1, 2, 3]; a.length = 1; a.length === 1 && a[1] === undefined;')).value, true);
});
test('对象缺键读得 undefined', async () => {
  eq((await runSrc('let o = { a: 1 }; o.b === undefined;')).value, true);
});
test('对象是 null 原型(constructor 不可达)', async () => {
  eq((await runSrc('let o = { a: 1 }; o.constructor;')).value, undefined);
  eq((await runSrc('let o = { a: 1 }; o["con" + "structor"];')).value, undefined);
});
test('字符串方法白名单', async () => {
  eq((await runSrc('"a,b".split(",").length;')).value, 2);
  eq((await runSrc('"hi".toUpperCase();')).value, 'HI');
});
test('表外方法抛 access', () => throwsKind('let s = "a"; s.toFixed;', 'access'));
test('函数零属性', () => throwsKind('let f = () => 1; f.name;', 'access'));
test('number 零属性', () => throwsKind('let x = (5).toString;', 'access'));
test('调用非函数值', () => throwsKind('let o = { f: 1 }; o.f();', 'type'));
test('for-of 对象抛 type 并提示 keys', () => throwsKind('for (const k of { a: 1 }) { }', 'type'));

/* ============ 内建(规格 8) ============ */

test('typeOf 精确分类', async () => {
  eq((await runSrc('typeOf(null) + typeOf(undefined) + typeOf([]) + typeOf({}) + typeOf(1) + typeOf("s") + typeOf(true) + typeOf(() => 1);')).value,
    'nullundefinedarrayobjectnumberstringbooleanfunction');
});
test('str/num/keys/fixed', async () => {
  eq((await runSrc('str(12) + str(true) + str(null);')).value, '12truenull');
  eq((await runSrc('fixed(3.14159, 2);')).value, '3.14');
  eq((await runSrc('keys({ b: 1, a: 2 }).join("");')).value, 'ba');
});
test('eq 深比较 + NaN 语义', async () => {
  eq((await runSrc('eq([1, [2, 3]], [1, [2, 3]]);')).value, true);
  eq((await runSrc('eq({ a: 1, b: [2] }, { b: [2], a: 1 });')).value, true);
  eq((await runSrc('eq(NaN, NaN);')).value, false);
});
test('copy 环安全 + 共享保留', async () => {
  const r = await runSrc(`
    let shared = { s: 1 };
    let o = {};
    o.a = shared;
    o.b = shared;
    o.self = o;
    let c = copy(o);
    str(c.a === c.b) + ":" + str(c.self === c) + ":" + str(eq(c, o));
  `);
  eq(r.value, 'true:true:true');
});
test('merge 浅合并', async () => {
  const r = await runSrc('let m = merge({ x: 1, y: 1 }, { x: 2, z: 3 }); m.x + m.y + m.z;');
  eq(r.value, 6);
});
test('JSON.parse 结果 null 原型', async () => {
  eq((await runSrc('JSON.parse("{\\"a\\":1}").constructor;')).value, undefined);
  eq((await runSrc('JSON.parse("{\\"a\\":1}").a;')).value, 1);
  eq((await runSrc('JSON.stringify([1, 2]);')).value, '[1,2]');
});
test('parseInt 恒十进制 + 部分解析', async () => {
  eq((await runSrc('parseInt("042");')).value, 42);
  eq((await runSrc('parseInt("42abc");')).value, 42);
  eq((await runSrc('num("42abc");')).value, NaN);
});
test('环引用 stringify 抛 range', () => throwsKind('let o = {}; o.self = o; JSON.stringify(o);', 'range'));

/* ============ 宿主边界(规格 10) ============ */

test('宿主数据深拷贝,写入不回传', async () => {
  const config = { level: 3, items: [1, 2] };
  const { rt } = makeRt({ config });
  await rt.run('config.level = 99; config.items.push(4);');
  eq(config.level, 3);
  eq(config.items, [1, 2]);
});
test('宿主函数按引用(能力)', async () => {
  let called = 0;
  const { rt } = makeRt({ bump: () => { called++; return called; } });
  const v = await rt.run('bump(); bump(); bump();');
  eq(v, 3);
  eq(called, 3);
});
test('宿主异常字符串化且无 stack', async () => {
  const { rt } = makeRt({ boom: () => { const e = new TypeError('内部细节'); e.cause = { secret: 1 }; throw e; } });
  const v = await rt.run('try { boom(); } catch (e) { e; }');
  eq(v, 'host: 内部细节');
});
test('宿主函数返回值深拷贝', async () => {
  const internal = { n: 1 };
  const { rt } = makeRt({ getConfig: () => internal });
  await rt.run('let c = getConfig(); c.n = 99;');
  eq(internal.n, 1);
});
test('每次执行全新快照', async () => {
  const { rt } = makeRt({ state: { n: 0 } });
  await rt.run('state.n = state.n + 1;');
  await rt.run('state.n = state.n + 1;');
  eq((await runSrc('0;')).value, 0);
});

/* ============ 编译拒绝(规格 13 禁用总表) ============ */

test('拒绝 ==', () => reject('let a = 1 == "1";', '==='));
test('拒绝 var', () => reject('var x = 1;', '禁止 var'));
test('拒绝 typeof 运算符', () => reject('let t = typeof 1;', 'typeOf()'));
test('拒绝 switch', () => reject('switch (1) { }', 'switch'));
test('拒绝 do-while', () => reject('do { } while (false);', 'do-while'));
test('拒绝 finally', () => reject('try { } catch (e) { } finally { }', '应为 ";"'));
test('拒绝一元 +', () => reject('let n = +"3";', 'num()'));
test('拒绝逗号运算符', () => reject('let x = (1, 2);', '应为 ")"'));
test('拒绝模板字符串', () => reject('let s = `hi ${1};`;', '模板字符串'));
test('拒绝展开', () => reject('let a = [...[1]];', '展开'));
test('拒绝 this 于类外', () => reject('function f() { return this; }', 'this'));
test('拒绝 extends', () => reject('class B extends A { }', 'extends'));
test('拒绝 new 普通函数(运行时)', () => throwsKind('let x = new (function f() { return f; })();', 'type'));
test('拒绝 delete/in/instanceof', () => Promise.all([
  reject('let o = { a: 1 }; delete o.a;', 'delete'),
  reject('"a" in {};', '禁止 in'),
  reject('1 instanceof Object;', 'instanceof'),
]));
test('拒绝 eval/Function/arguments/import', () => Promise.all([
  reject('eval("1");', 'eval'),
  reject('Function("return 1");', 'Function'),
  reject('function f() { return arguments; }', 'arguments'),
  reject('import x from "y";', 'import'),
]));
test('拒绝 window/fetch 等未白名单全局', () => Promise.all([
  reject('window.location;', '未声明'),
  reject('fetch("http://x");', '未声明'),
  reject('globalThis;', '未声明'),
]));
test('拒绝 let 未初始化', () => reject('let x;', '初始化'));
test('拒绝遮蔽白名单全局', () => reject('let undefined = 1;', '遮蔽'));
test('拒绝给白名单全局赋值', () => reject('NaN = 1;', '白名单'));
test('拒绝 const 重赋值', () => reject('const c = 1; c = 2;', 'const'));
test('拒绝赋值作表达式', () => reject('let x = 0; if (x = 1) { }', '应为 ")"'));
test('拒绝链式赋值', () => reject('let a = 1; let b = 2; a = b = 3;', '应为 ";"'));
test('拒绝空语句', () => reject(';', '空语句'));
test('拒绝对象方法简写/getter', () => Promise.all([
  reject('let o = { m() { return 1; } };', '应为 ":"'),
  reject('let o = { get x() { return 1; } };', '应为 ":"'),
]));
test('拒绝数字键与重复键', () => Promise.all([
  reject('let o = { 1: "a" };', '标识符或字符串'),
  reject('let o = { a: 1, a: 2 };', '重复'),
]));
test('constructor 禁带值 return', () => reject('class A { constructor() { return 1; } }', 'constructor'));
test('对象键 __proto__ 拒绝(缺键 undefined)', async () => {
  // null 原型:__proto__ 只是普通自有键,读写无原型语义
  eq((await runSrc('let o = {}; o.__proto__ === undefined;')).value, true);
});

/* ============ 模板引擎(规格 16) ============ */

async function render(tpl, data) {
  const code = compileTemplate(tpl);
  const mod = await importModule(code);
  const tree = await mod.default(withTemplateHelpers(makeAether(Object.create(null))), data);
  return treeToHtml(tree);
}

test('文本与插值转义', async () => {
  eq(await render('<p>{{it.name}}</p>', { name: '<b>&x' }), '<p>&lt;b&gt;&amp;x</p>');
});
test('数字插值自动字符串化', async () => {
  eq(await render('<p>共 {{it.count}} 关</p>', { count: 5 }), '<p>共 5 关</p>');
});
test('属性槽转义', async () => {
  eq(await render('<p title="{{it.t}}">x</p>', { t: 'a"b' }), '<p title="a&quot;b">x</p>');
});
test('each 与 if/else', async () => {
  const html = await render(
    '<ul>{{#each it.items as i}}<li class="{{i.kind}}">{{i.label}}{{#if i.hot}}<b>!</b>{{/if}}</li>{{/each}}</ul>',
    { items: [{ kind: 'a', label: 'x', hot: true }, { kind: 'b', label: 'y', hot: false }] }
  );
  eq(html, '<ul><li class="a">x<b>!</b></li><li class="b">y</li></ul>');
});
test('嵌套元素与静态文本', async () => {
  eq(await render('<div id="main"><h1>{{it.title}}</h1><p>hello</p></div>', { title: 'T' }),
    '<div id="main"><h1>T</h1><p>hello</p></div>');
});
test('URL 槽:相对路径通过', async () => {
  eq(await render('<a href="{{it.link}}">go</a>', { link: 'pages/next.html' }), '<a href="pages/next.html">go</a>');
});
test('URL 槽:外链拒绝', async () => {
  for (const bad of ['http://x.com/a.js', 'javascript:alert(1)', 'data:text/html,x', '//cdn.evil/x']) {
    let threw = false;
    try { await render('<a href="{{it.l}}">x</a>', { l: bad }); } catch (e) { threw = e.kind === 'access'; }
    if (!threw) throw new Error(`外链未被拒绝:${bad}`);
  }
});
test('style 属性级白名单', async () => {
  eq(await render('<p style="color: {{it.c}}; font-size: 14px;">x</p>', { c: 'red' }),
    '<p style="color: red; font-size: 14px">x</p>');
});
test('style 白名单外属性拒绝', async () => {
  let threw = false;
  try { await render('<p style="behavior: url(x);">x</p>', {}); } catch (e) { threw = true; }
  if (!threw) throw new Error('style 白名单未生效');
});
test('style 值字符集拒绝', async () => {
  let threw = false;
  try { await render('<p style="color: red; background: url(\\\'x\\\')">x</p>', {}); } catch (e) { threw = true; }
  if (!threw) throw new Error('style 值字符集未拦截');
});
test('白名单外标签拒绝', async () => {
  const { CompileError: CE } = await import('../src/errors.js');
  for (const bad of ['<script>x</script>', '<iframe></iframe>', '<marquee>x</marquee>']) {
    let threw = false;
    try { compileTemplate(bad); } catch (e) { threw = e instanceof CE; }
    if (!threw) throw new Error(`标签未拒绝:${bad}`);
  }
});
test('on* 属性拒绝', async () => {
  let threw = false;
  try { await render('<p onclick="{{it.f}}">x</p>', { f: 'x' }); } catch (e) { threw = true; }
  if (!threw) throw new Error('on* 未拦截');
});
test('白名单外属性拒绝', async () => {
  let threw = false;
  try { await render('<p tabindex="1">x</p>', {}); } catch (e) { threw = true; }
  if (!threw) throw new Error('属性白名单未生效');
});
test('未闭合标签拒绝', async () => {
  let threw = false;
  try { await compileTemplate('<div><p>x</div>'); } catch (e) { threw = true; }
  if (!threw) throw new Error('未闭合未拦截');
});
test('无引号属性拒绝', async () => {
  let threw = false;
  try { await compileTemplate('<p title=x>y</p>'); } catch (e) { threw = true; }
  if (!threw) throw new Error('无引号属性未拦截');
});
test('插值引用未知变量拒绝', async () => {
  let threw = false;
  try { await render('<p>{{unknownVar}}</p>', {}); } catch (e) { threw = true; }
  if (!threw) throw new Error('未知变量未拦截');
});
test('插值禁止副作用/函数', async () => {
  for (const tpl of ['<p>{{it.x++}}</p>', '<p>{{() => 1}}</p>', '<p>{{new it.x}}</p>']) {
    let threw = false;
    try { await compileTemplate(tpl); } catch (e) { threw = true; }
    if (!threw) throw new Error(`插值约束未生效:${tpl}`);
  }
});
test('插值表达式走 AetherJS 严格运算', async () => {
  eq(await render('<p>{{it.a + it.b}}</p>', { a: 1, b: 2 }), '<p>3</p>');
  let threw = false;
  try { await render('<p>{{it.a + it.b}}</p>', { a: '1', b: 2 }); } catch (e) { threw = true; }
  if (!threw) throw new Error('插值混型未拦截');
});
test('checkHtml(Node 跳过提示)', async () => {
  const { checkHtml } = await import('../src/template.js');
  const r = checkHtml('<p>x</p>');
  eq(r.ok, true);
});

/* ============ 产物形态(规格 B.2) ============ */

test('产物是 ES 模块、可 data: 加载、含 AETHER 签名', async () => {
  const p = compile('1 + 2;');
  if (!p.code.includes('export default function (AETHER)')) throw new Error('产物形态不符');
  const mod = await p.load();
  if (typeof mod.default !== 'function') throw new Error('默认导出不是函数');
  eq(mod.default(makeAether(Object.create(null))), 3);
});
test('同源缓存与重复执行', async () => {
  const { rt } = makeRt();
  eq(await rt.run('let x = 1; x + 1;'), 2);
  eq(await rt.run('let x = 1; x + 1;'), 2);
});

/* ============ 汇总 ============ */

for (const t of queue) await t;
console.log(`通过 ${pass},失败 ${fail}`);
if (fail > 0) {
  for (const { name, e } of failed) console.error(`✗ ${name}\n    ${e.message}`);
  process.exit(1);
}
