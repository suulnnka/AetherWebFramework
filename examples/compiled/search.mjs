// AetherJS v0.2 编译产物 —— 由受验证 AST 逐节点重建,禁止手工修改后注入(规格 B.1)
// 加载方式:浏览器 Blob URL 动态 import / Node data: URL(规格 B.2,非 eval)
export default function (AETHER) {
  var $get = AETHER.get, $set = AETHER.set, $len = AETHER.setLen;
  var $call = AETHER.call, $mcall = AETHER.mcall, $new = AETHER.news, $class = AETHER.cls, $catch = AETHER.catchErr;
  var $test = AETHER.test, $bool = AETHER.bool, $not = AETHER.not, $iter = AETHER.iter, $obj = AETHER.obj;
  var $add = AETHER.add, $sub = AETHER.sub, $mul = AETHER.mul, $div = AETHER.div, $mod = AETHER.mod, $pow = AETHER.pow;
  var $band = AETHER.band, $bor = AETHER.bor, $bxor = AETHER.bxor, $bnot = AETHER.bnot;
  var $shl = AETHER.shl, $shr = AETHER.shr, $shru = AETHER.shru, $neg = AETHER.neg;
  var $lt = AETHER.lt, $le = AETHER.le, $gt = AETHER.gt, $ge = AETHER.ge;
  var Math = AETHER.g.Math;
  var JSON = AETHER.g.JSON;
  var NaN = AETHER.g.NaN;
  var Infinity = AETHER.g.Infinity;
  var undefined = AETHER.g.undefined;
  var isNaN = AETHER.g.isNaN;
  var isFinite = AETHER.g.isFinite;
  var parseInt = AETHER.g.parseInt;
  var parseFloat = AETHER.g.parseFloat;
  var typeOf = AETHER.g.typeOf;
  var str = AETHER.g.str;
  var num = AETHER.g.num;
  var keys = AETHER.g.keys;
  var eq = AETHER.g.eq;
  var copy = AETHER.g.copy;
  var merge = AETHER.g.merge;
  var fixed = AETHER.g.fixed;
  var print = AETHER.g.print;
  var ui = AETHER.g.ui;
  var $r;
  let pages = [$obj([
  ["title", "AetherJS 语言规格 v0.2"],
  ["url", "docs/lang.html"],
  ["text", "AetherJS 是 JavaScript 的安全子集:全严格运算符、null 原型对象、编译期标识符白名单,编译为 ES 模块产物。规格经十三轮迭代定稿。"]
]), $obj([
  ["title", "模板引擎:白名单文法与类型化槽"],
  ["url", "docs/template.html"],
  ["text", "模板是程序不是字符串:白名单文法解析为 IR,值只进类型化槽。href 与 src 校验非转义,仅允许相对路径,外部资源一律拒绝。"]
]), $obj([
  ["title", "DOM 控制通道:句柄与窄命令集"],
  ["url", "docs/dom.html"],
  ["text", "脚本摸不到真实节点,只持有宿主铸造的不透明句柄;ui 命令的值与模板共用同一套白名单校验。"]
]), $obj([
  ["title", "伪后端路由(Django 风格)"],
  ["url", "docs/route.html"],
  ["text", "路由表是纯数据:domain、subdomain、port、path 参数与 path 星号兜底。处理函数收 args 与 progress,返回模板索引与数据。"]
]), $obj([
  ["title", "AetherWebOS:浏览器里的操作系统"],
  ["url", "index.html"],
  ["text", "窗口管理、文件管家、Markdown 编辑器与应用商店,全部跑在浏览器里;不可信脚本经 AetherJS 沙盒执行。"]
]), $obj([
  ["title", "宿主边界隔离:五层安全模型"],
  ["url", "docs/security.html"],
  ["text", "数据入界深拷贝为 null 原型快照,函数按引用注入,程序返回值是唯一数据出口;宿主异常跨界仅保留 message。"]
]), $obj([
  ["title", "AetherWebDatabase 入门"],
  ["url", "db/intro.html"],
  ["text", "同族项目:AetherWebDatabase 提供浏览器内的持久化存储,与 AetherWebOS 桌面应用共享生态。"]
]), $obj([
  ["title", "零依赖编译器手记"],
  ["url", "blog/zero-dep.html"],
  ["text", "手写词法加递归下降解析,拒绝解析器生成器与完整 JS 解析器裁剪:白名单哲学之下,黑名单裁剪漏一种节点即漏洞。"]
]), $obj([
  ["title", "类与 this:子集原则的试金石"],
  ["url", "blog/class.html"],
  ["text", "class 保留 JS 语法与语义:new 必填、this 仅类成员体合法、方法提取后 this 为 undefined;不做继承,复用用组合。"]
]), $obj([
  ["title", "应用商店上架指南"],
  ["url", "store/publish.html"],
  ["text", "webos 应用清单、一级域名归属与 dev 模式调试面板;print 输出与错误串在 console 面板可见。"]
])];
  function words(query) {
    let out = [];
    for (const w of $iter($mcall($mcall(query, "toLowerCase", []), "split", [" "]))) {
      const t = $mcall(w, "trim", []);
      if ($test((t !== ""))) {
        $mcall(out, "push", [t]);
      }
    }
    return out;
  }
  function countHits(haystack, term) {
    if ($test((term === ""))) {
      return 0;
    }
    let n = 0;
    let at = $mcall(haystack, "indexOf", [term]);
    while ($test($ge(at, 0))) {
      (n = $add(n, 1));
      (at = $mcall(haystack, "indexOf", [term, $add(at, $get(term, "length"))]));
    }
    return n;
  }
  let Engine = $class("Engine", [["pages", function () { return []; }]], [["constructor", function (pages) {
  $set(this, "pages", pages);
}], ["score", function (page, terms) {
  let s = 0;
  const title = $mcall($get(page, "title"), "toLowerCase", []);
  const text = $mcall($get(page, "text"), "toLowerCase", []);
  for (const term of $iter(terms)) {
    const inTitle = $call(countHits, [title, term]);
    const inText = $call(countHits, [text, term]);
    if ($test((($add(inTitle, inText)) === 0))) {
      return 0;
    }
    (s = $add(s, $add($mul(inTitle, 8), $mul(inText, 2))));
  }
  return s;
}], ["snippet", function (page, terms) {
  const text = $get(page, "text");
  const lower = $mcall(text, "toLowerCase", []);
  let first = $neg(1);
  for (const term of $iter(terms)) {
    const at = $mcall(lower, "indexOf", [term]);
    if ($test(($bool($ge(at, 0)) && $bool(($bool($lt(first, 0)) || $bool($lt(at, first))))))) {
      (first = at);
    }
  }
  if ($test($lt(first, 0))) {
    return [$obj([
  ["text", text],
  ["hit", false]
])];
  }
  const start = $mcall(Math, "max", [0, $sub(first, 10)]);
  const end = $mcall(Math, "min", [$get(text, "length"), $add(start, 60)]);
  const win = $mcall(text, "slice", [start, end]);
  const wlower = $mcall(win, "toLowerCase", []);
  let marks = [];
  for (let i = 0; $lt(i, $get(win, "length")) ; (i = $add(i, 1))) {
    $mcall(marks, "push", [false]);
  }
  for (const term of $iter(terms)) {
    let at = $mcall(wlower, "indexOf", [term]);
    while ($test($ge(at, 0))) {
      for (let i = at; ($bool($lt(i, $add(at, $get(term, "length")))) && $bool($lt(i, $get(marks, "length")))) ; (i = $add(i, 1))) {
        $set(marks, i, true);
      }
      (at = $mcall(wlower, "indexOf", [term, $add(at, $get(term, "length"))]));
    }
  }
  let segs = [];
  let buf = "";
  let cur = false;
  for (let i = 0; $lt(i, $get(win, "length")) ; (i = $add(i, 1))) {
    if ($test((($get(marks, i)) !== cur))) {
      if ($test((buf !== ""))) {
        $mcall(segs, "push", [$obj([
  ["text", buf],
  ["hit", cur]
])]);
      }
      (buf = "");
      (cur = $get(marks, i));
    }
    (buf = $add(buf, $mcall(win, "charAt", [i])));
  }
  if ($test((buf !== ""))) {
    $mcall(segs, "push", [$obj([
  ["text", buf],
  ["hit", cur]
])]);
  }
  if ($test($gt(start, 0))) {
    $mcall(segs, "unshift", [$obj([
  ["text", "…"],
  ["hit", false]
])]);
  }
  if ($test($lt(end, $get(text, "length")))) {
    $mcall(segs, "push", [$obj([
  ["text", "…"],
  ["hit", false]
])]);
  }
  return segs;
}], ["search", function (query) {
  const terms = $call(words, [query]);
  let scored = [];
  for (const page of $iter($get(this, "pages"))) {
    const s = $mcall(this, "score", [page, terms]);
    if ($test($gt(s, 0))) {
      $mcall(scored, "push", [$obj([
  ["page", page],
  ["score", s]
])]);
    }
  }
  $mcall(scored, "sort", [((a, b) => ($sub($get(b, "score"), $get(a, "score"))))]);
  let out = [];
  for (const r of $iter(scored)) {
    $mcall(out, "push", [$obj([
  ["title", $get($get(r, "page"), "title")],
  ["url", $get($get(r, "page"), "url")],
  ["segs", $mcall(this, "snippet", [$get(r, "page"), terms])]
])]);
  }
  return out;
}]]);
  const engine = $new(Engine, [pages]);
  return ((args, progress) => {
let query = "";
if ($test((($call(typeOf, [$get(args, "q")])) === "string"))) {
(query = $mcall($get(args, "q"), "trim", []));
}
let results = $mcall(engine, "search", [query]);
return $obj([
  ["template", 0],
  ["data", $obj([
  ["query", query],
  ["hasQuery", (query !== "")],
  ["hasResults", $gt($get(results, "length"), 0)],
  ["count", $get(results, "length")],
  ["secs", $call(fixed, [$add($div($mcall(Math, "random", []), 4), 0.01), 3])],
  ["results", results]
])]
]);
});
  return $r;
}
