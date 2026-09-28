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
let hp = 76;
$mcall(ui, "on", [$get(refs, "heal"), "click", ((ev) => {
(hp = $add(hp, 5));
if ($test($gt(hp, 100))) {
(hp = 100);
}
$mcall(ui, "text", [$get(refs, "hp"), $add("HP ", $call(str, [hp]))]);
$mcall(ui, "cls", [$get(refs, "hp"), "toggle", "flash"]);
if ($test($ge(hp, 100))) {
$mcall(ui, "style", [$get(refs, "hp"), "color", "#b30"]);
$mcall(ui, "text", [$get(refs, "heal"), "已满"]);
}
})]);
$mcall(ui, "on", [$get(refs, "hit"), "click", ((ev) => {
(hp = $sub(hp, 12));
if ($test($lt(hp, 0))) {
(hp = 0);
}
$mcall(ui, "text", [$get(refs, "hp"), $add("HP ", $call(str, [hp]))]);
$mcall(ui, "style", [$get(refs, "hp"), "color", ($test($lt(hp, 30)) ? "#b30" : "#2a5")]);
})]);
});
  return $r;
}
