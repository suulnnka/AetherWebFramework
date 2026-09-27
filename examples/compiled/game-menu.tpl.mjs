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
  return [$obj([["tag", "div"], ["attrs", $obj([["id", "menu"]])], ["style", $obj([])], ["children", [$obj([["tag", "h1"], ["attrs", $obj([])], ["style", $obj([])], ["children", [$esc($str($get(it, "title")))]]]), $obj([["tag", "p"], ["attrs", $obj([["class", "headline"]])], ["style", $obj([])], ["children", [$esc($str($get(it, "headline")))]]]), $obj([["tag", "p"], ["attrs", $obj([])], ["style", $obj([["color", "#356"], ["font-size", "13px"]])], ["children", [$esc($str($get($get(it, "player"), "name"))), " · HP ", $esc($str($get($get(it, "player"), "hp")))]]]), $obj([["tag", "ul"], ["attrs", $obj([])], ["style", $obj([])], ["children", [((items) => { const out = []; for (const q of $iter(items)) { out.push(...[$obj([["tag", "li"], ["attrs", $obj([["class", "quest"]])], ["style", $obj([])], ["children", [$obj([["tag", "b"], ["attrs", $obj([])], ["style", $obj([])], ["children", [$esc($str($get(q, "name")))]]]), $obj([["tag", "span"], ["attrs", $obj([["class", "lv"]])], ["style", $obj([["color", $sty("color", $str($get(q, "tone")))]])], ["children", ["Lv.", $esc($str($get(q, "level")))]]]), ($test($get(q, "hot")) ? [$obj([["tag", "em"], ["attrs", $obj([])], ["style", $obj([])], ["children", ["热门"]]])] : [])]]])]); } return out; })($get(it, "quests"))]]]), $obj([["tag", "p"], ["attrs", $obj([["class", "foot"]])], ["style", $obj([])], ["children", [$obj([["tag", "a"], ["attrs", $obj([["href", "pages/help.html"]])], ["style", $obj([])], ["children", ["玩法说明"]]]), " · ", $obj([["tag", "a"], ["attrs", $obj([["href", "index.html"]])], ["style", $obj([])], ["children", ["返回"]]])]]])]]])];
}
