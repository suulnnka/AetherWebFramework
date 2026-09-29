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
  return ((refs) => {
let pages = [$obj([
  ["title", "AetherJS 语言规格 v0.2"],
  ["url", "docs/lang.html"],
  ["text", "AetherJS 是 JavaScript 的安全子集:全严格运算符与编译期白名单。"]
]), $obj([
  ["title", "模板引擎:白名单文法与类型化槽"],
  ["url", "docs/template.html"],
  ["text", "模板按程序编译为 IR,值只进类型化槽,外部资源一律拒绝。"]
]), $obj([
  ["title", "DOM 控制通道:句柄与窄命令集"],
  ["url", "docs/dom.html"],
  ["text", "脚本摸不到真实节点,只持有宿主铸造的不透明句柄。"]
]), $obj([
  ["title", "伪后端路由"],
  ["url", "docs/route.html"],
  ["text", "路由表是纯数据,处理函数收 args 与 progress 返回数据。"]
]), $obj([
  ["title", "AetherWebOS:浏览器里的操作系统"],
  ["url", "index.html"],
  ["text", "窗口、文件管家与应用商店,不可信脚本经沙盒执行。"]
]), $obj([
  ["title", "宿主边界隔离:五层安全模型"],
  ["url", "docs/security.html"],
  ["text", "数据入界深拷贝快照,返回值是唯一出口。"]
])];
let query = "";
let pinned = false;
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
function search(q) {
let terms = [];
for (const w of $iter($mcall($mcall(q, "toLowerCase", []), "split", [" "]))) {
let t = $mcall(w, "trim", []);
if ($test((t !== ""))) {
$mcall(terms, "push", [t]);
}
}
let scored = [];
for (const page of $iter(pages)) {
let title = $mcall($get(page, "title"), "toLowerCase", []);
let text = $mcall($get(page, "text"), "toLowerCase", []);
let s = 0;
for (const term of $iter(terms)) {
let inTitle = $call(countHits, [title, term]);
let inText = $call(countHits, [text, term]);
if ($test((($add(inTitle, inText)) === 0))) {
(s = 0);
break;
}
(s = $add(s, $add($mul(inTitle, 8), $mul(inText, 2))));
}
if ($test($gt(s, 0))) {
$mcall(scored, "push", [$obj([
  ["page", page],
  ["score", s]
])]);
}
}
$mcall(scored, "sort", [((a, b) => ($sub($get(b, "score"), $get(a, "score"))))]);
return $obj([
  ["scored", scored],
  ["terms", terms]
]);
}
function snippet(text, terms) {
let lower = $mcall(text, "toLowerCase", []);
let first = $neg(1);
for (const term of $iter(terms)) {
let at = $mcall(lower, "indexOf", [term]);
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
let start = $mcall(Math, "max", [0, $sub(first, 10)]);
let end = $mcall(Math, "min", [$get(text, "length"), $add(start, 60)]);
let win = $mcall(text, "slice", [start, end]);
let wlower = $mcall(win, "toLowerCase", []);
let marks = [];
for (let i = 0; $lt(i, $get(win, "length")); (i = $add(i, 1))) {
$mcall(marks, "push", [false]);
}
for (const term of $iter(terms)) {
let at = $mcall(wlower, "indexOf", [term]);
while ($test($ge(at, 0))) {
for (let i = at; ($bool($lt(i, $add(at, $get(term, "length")))) && $bool($lt(i, $get(marks, "length")))); (i = $add(i, 1))) {
$set(marks, i, true);
}
(at = $mcall(wlower, "indexOf", [term, $add(at, $get(term, "length"))]));
}
}
let segs = [];
let buf = "";
let cur = false;
for (let i = 0; $lt(i, $get(win, "length")); (i = $add(i, 1))) {
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
}
function render() {
$mcall(ui, "text", [$get(refs, "q"), ($test((query === "")) ? "请输入关键词…" : ($add(query, ($test(pinned) ? "" : "_"))))]);
let res = $call(search, [query]);
$mcall(ui, "text", [$get(refs, "results"), ""]);
if ($test((query === ""))) {
$mcall(ui, "text", [$get(refs, "stats"), ""]);
return;
}
if ($test((($get($get(res, "scored"), "length")) === 0))) {
$mcall(ui, "text", [$get(refs, "stats"), "找到约 0 条结果"]);
$mcall(ui, "append", [$get(refs, "results"), $obj([
  ["tag", "p"],
  ["attrs", $obj([
  ["class", "empty"]
])],
  ["style", $obj([
  ["color", "#4d5156"],
  ["margin", "60px 0 0 0"]
])],
  ["children", ["找不到和您查询相符的内容。"]]
])]);
return;
}
$mcall(ui, "text", [$get(refs, "stats"), $add($add($add("找到约 ", $call(str, [$get($get(res, "scored"), "length")])), " 条结果"), ($test(pinned) ? " · 已定格(Esc 重新输入)" : ""))]);
let limit = $mcall(Math, "min", [$get($get(res, "scored"), "length"), 6]);
let items = [];
for (let i = 0; $lt(i, limit); (i = $add(i, 1))) {
let r = $get($get(res, "scored"), i);
let segParts = [];
for (const seg of $iter($call(snippet, [$get($get(r, "page"), "text"), $get(res, "terms")]))) {
if ($test($get(seg, "hit"))) {
$mcall(segParts, "push", [$obj([
  ["tag", "b"],
  ["attrs", $obj([])],
  ["style", $obj([])],
  ["children", [$get(seg, "text")]]
])]);
} else {
$mcall(segParts, "push", [$get(seg, "text")]);
}
}
$mcall(items, "push", [$obj([
  ["tag", "li"],
  ["attrs", $obj([
  ["class", "hit"]
])],
  ["style", $obj([
  ["margin", "20px 0"]
])],
  ["children", [$obj([
  ["tag", "p"],
  ["attrs", $obj([
  ["class", "url"]
])],
  ["style", $obj([
  ["color", "#0d652d"],
  ["font-size", "13px"],
  ["margin", "2px 0"]
])],
  ["children", [$get($get(r, "page"), "url")]]
]), $obj([
  ["tag", "p"],
  ["attrs", $obj([
  ["class", "title"]
])],
  ["style", $obj([
  ["margin", "2px 0"]
])],
  ["children", [$obj([
  ["tag", "a"],
  ["attrs", $obj([
  ["href", $get($get(r, "page"), "url")]
])],
  ["style", $obj([
  ["color", "#1a0dab"],
  ["font-size", "17px"],
  ["text-decoration", "none"]
])],
  ["children", [$get($get(r, "page"), "title")]]
])]]
]), $obj([
  ["tag", "p"],
  ["attrs", $obj([
  ["class", "snippet"]
])],
  ["style", $obj([
  ["color", "#4d5156"],
  ["font-size", "13px"],
  ["line-height", "1.6"]
])],
  ["children", segParts]
])]]
])]);
}
$mcall(ui, "append", [$get(refs, "results"), $obj([
  ["tag", "ol"],
  ["attrs", $obj([])],
  ["style", $obj([])],
  ["children", items]
])]);
}
$mcall(ui, "on", [$get(refs, "q"), "keydown", ((ev) => {
if ($test((($get(ev, "key")) === "Enter"))) {
(pinned = true);
} else if ($test((($get(ev, "key")) === "Backspace"))) {
(query = $mcall(query, "slice", [0, $sub($get(query, "length"), 1)]));
(pinned = false);
} else if ($test((($get(ev, "key")) === "Escape"))) {
(query = "");
(pinned = false);
} else if ($test((($get($get(ev, "key"), "length")) === 1))) {
(query = $add(query, $get(ev, "key")));
(pinned = false);
}
$call(render, []);
})]);
$call(render, []);
});
  return $r;
}
