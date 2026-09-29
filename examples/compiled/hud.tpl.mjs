// AetherJS v0.2 模板渲染产物(规格 16)—— 由白名单文法 IR 重建,禁止手改
// 数据约定:根变量 it;挂载走 IR→DOM 或 DOMParser 复检(16.4),innerHTML 不经手
export default function (AETHER, it) {
  var $get = AETHER.get, $set = AETHER.set, $obj = AETHER.obj;
  var $call = AETHER.call, $mcall = AETHER.mcall, $iter = AETHER.iter;
  var $test = AETHER.test, $bool = AETHER.bool, $not = AETHER.not;
  var $add = AETHER.add, $sub = AETHER.sub, $mul = AETHER.mul, $div = AETHER.div, $mod = AETHER.mod, $pow = AETHER.pow;
  var $band = AETHER.band, $bor = AETHER.bor, $bxor = AETHER.bxor, $bnot = AETHER.bnot;
  var $shl = AETHER.shl, $shr = AETHER.shr, $shru = AETHER.shru, $neg = AETHER.neg;
  var $lt = AETHER.lt, $le = AETHER.le, $gt = AETHER.gt, $ge = AETHER.ge;
  var $esc = AETHER.escText, $escA = AETHER.escAttr, $url = AETHER.urlSlot, $sty = AETHER.styleVal;
  var $str = AETHER.g.str;
  return [$obj([["tag", "div"], ["attrs", $obj([["id", "hud"]])], ["style", $obj([])], ["children", [$obj([["tag", "p"], ["attrs", $obj([["ref", "hp"]])], ["style", $obj([["color", "#2a5"]])], ["children", ["HP 76"]]]), $obj([["tag", "p"], ["attrs", $obj([])], ["style", $obj([])], ["children", [$obj([["tag", "a"], ["attrs", $obj([["ref", "heal"], ["href", $escA($url("act/heal"))]])], ["style", $obj([])], ["children", ["治疗"]]]), " ·\n    ", $obj([["tag", "a"], ["attrs", $obj([["ref", "hit"], ["href", $escA($url("act/hit"))]])], ["style", $obj([])], ["children", ["受击"]]])]]])]]])];
}
