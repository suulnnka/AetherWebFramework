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
  let quests = [$obj([
  ["id", "q1"],
  ["name", "迷雾森林"],
  ["level", 3],
  ["hot", true],
  ["tone", "#586"]
]), $obj([
  ["id", "q2"],
  ["name", "沉没神殿"],
  ["level", 7],
  ["hot", true],
  ["tone", "#b30"]
]), $obj([
  ["id", "q3"],
  ["name", "草原试炼"],
  ["level", 1],
  ["hot", false],
  ["tone", "#586"]
]), $obj([
  ["id", "q4"],
  ["name", "星之塔"],
  ["level", 9],
  ["hot", false],
  ["tone", "#b30"]
])];
  let Summary = $class("Summary", [["total", function () { return 0; }], ["maxLevel", function () { return 0; }]], [["constructor", function (quests) {
  for (const q of $iter(quests)) {
    ((o) => $set(o, "total", $add($get(o, "total"), 1)))(this);
    if ($test($gt($get(q, "level"), $get(this, "maxLevel")))) {
      $set(this, "maxLevel", $get(q, "level"));
    }
  }
}], ["headline", function () {
  return $add($add($call(str, [$get(this, "total")]), " 个关卡,最高 Lv."), $call(str, [$get(this, "maxLevel")]));
}]]);
  let s = $new(Summary, [quests]);
  return $obj([
  ["title", "选择关卡"],
  ["headline", $mcall(s, "headline", [])],
  ["player", $obj([
  ["name", "Alice"],
  ["hp", 76]
])],
  ["quests", quests]
]);
  return $r;
}
