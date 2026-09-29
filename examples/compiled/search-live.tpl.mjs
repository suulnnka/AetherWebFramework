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
  return [$obj([["tag", "div"], ["attrs", $obj([["id", "live"]])], ["style", $obj([["margin", "24px auto"], ["width", "560px"]])], ["children", [$obj([["tag", "p"], ["attrs", $obj([])], ["style", $obj([["font-size", "30px"], ["font-weight", "bold"]])], ["children", [$obj([["tag", "span"], ["attrs", $obj([])], ["style", $obj([["color", "#4285f4"]])], ["children", ["A"]]]), $obj([["tag", "span"], ["attrs", $obj([])], ["style", $obj([["color", "#ea4335"]])], ["children", ["e"]]]), $obj([["tag", "span"], ["attrs", $obj([])], ["style", $obj([["color", "#fbbc05"]])], ["children", ["t"]]]), $obj([["tag", "span"], ["attrs", $obj([])], ["style", $obj([["color", "#4285f4"]])], ["children", ["h"]]]), $obj([["tag", "span"], ["attrs", $obj([])], ["style", $obj([["color", "#34a853"]])], ["children", ["e"]]]), $obj([["tag", "span"], ["attrs", $obj([])], ["style", $obj([["color", "#ea4335"]])], ["children", ["r"]]])]]]), $obj([["tag", "p"], ["attrs", $obj([["ref", "q"], ["id", "qbox"]])], ["style", $obj([["border", "1px solid #dfe1e5"], ["border-radius", "22px"], ["padding", "10px 18px"], ["color", "#202124"], ["font-size", "15px"]])], ["children", ["请输入关键词…"]]]), $obj([["tag", "p"], ["attrs", $obj([["ref", "stats"], ["id", "stats"]])], ["style", $obj([["color", "#70757a"], ["font-size", "13px"]])], ["children", []]]), $obj([["tag", "div"], ["attrs", $obj([["ref", "results"], ["id", "results"]])], ["style", $obj([])], ["children", []]]), $obj([["tag", "p"], ["attrs", $obj([])], ["style", $obj([["color", "#9aa0a6"], ["font-size", "12px"]])], ["children", ["敲键即搜 · Enter 定格 · Backspace 删字 · Esc 清空(按键由宿主派发到搜索框)"]]])]]])];
}
