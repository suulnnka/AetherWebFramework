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
  var $r;
  let scores = [72, 91, 55, 84, 68];
  let total = 0;
  for (const s of $iter(scores)) {
    $r = (total = $add(total, s));
  }
  let mean = $div(total, $get(scores, "length"));
  let Grader = $class("Grader", [["cutoff", function () { return 60; }]], [["constructor", function (cutoff) {
  $set(this, "cutoff", cutoff);
}], ["grade", function (m) {
  if ($test($ge(m, $get(this, "cutoff")))) {
    return "及格";
  }
  return "不及格";
}]]);
  let g = $new(Grader, [60]);
  $r = $call(print, [$add($add($add("均值 ", $call(fixed, [mean, 1])), " → "), $mcall(g, "grade", [mean]))]);
  $r = $call(print, [$add($call(num, ["3"]), 1)]);
  $r = $call(print, [$add($call(str, [12]), " 个关卡")]);
  let table = $obj([
  ["hp", 30],
  ["mp", 12]
]);
  let copy1 = $call(merge, [table, $obj([
  ["hp", 99]
])]);
  $r = $call(print, [$add($add($call(eq, [table, $obj([
  ["hp", 30],
  ["mp", 12]
])]), " / "), $get(copy1, "hp"))]);
  try {
    $r = $add(1, "a");
  } catch ($__e) {
    let e = $catch($__e);
    $r = $call(print, ["捕获:", e]);
  }
  return $obj([
  ["title", "评分"],
  ["mean", mean],
  ["pass", $mcall(g, "grade", [mean])]
]);
  return $r;
}
