/**
 * AetherJS v0.2 DOM 控制通道(规格 16.6)。
 *
 * 原则:脚本摸不到真实 DOM 节点 —— 只持有宿主铸造的**不透明句柄**
 * (以函数值形态跨界,天然按引用传递,不可调用、不可伪造),
 * 通过窄命令集 ui.* 操作,值全走模板侧同一套白名单(单一事实来源)。
 *
 *   模板声明 <p ref="hp"> → 宿主 materialize 时铸造句柄 → refs 表
 *   程序末尾 return (refs) => { ui.on(refs.btn, "click", (ev) => { … }); };
 *
 * 安全要点:
 * - 句柄 = 单元素能力,解析时校验"仍连接且在本挂载根内",失效即拒
 * - 事件只把**数据快照**传给沙盒回调({type,key,x,y,…}),裸 Event 不跨界
 * - ui.append 的树必须先过 validateTree(脚本可手搓树 → 验完再物化)
 * - 物化走 createElement/textContent/setAttribute,innerHTML 全程不存在
 */

import { TAGS, checkAttr, checkUrlValue, checkStyleProp, checkStyleValue, checkClassToken } from './template.js';
import { AetherError } from './errors.js';

const err = (kind, msg) => new AetherError(kind, msg);

/** 事件类型白名单(无表单/无输入类元素,收窄到指针与键盘) */
const EVENT_TYPES = new Set([
  'click', 'dblclick', 'keydown', 'keyup', 'mouseenter', 'mouseleave', 'input', 'change',
]);

/* ---------- 树校验(ui.append 的唯一入口关卡,规格 16.6) ---------- */

export function validateTree(tree) {
  const one = (node) => {    if (typeof node === 'string') return; // 物化走 textContent,原始 < 也无解析风险
    if (node === null || typeof node !== 'object') {
      throw err('access', `树节点必须是 string 或对象,实际 ${node === null ? 'null' : typeof node}`);
    }
    if (!TAGS.has(node.tag)) throw err('access', `标签 <${node.tag}> 不在白名单(规格 16.2)`);
    for (const [k, v] of Object.entries(node.attrs ?? {})) {
      const bad = checkAttr(node.tag, k);
      if (bad) throw err('access', bad);
      if (typeof v !== 'string') throw err('access', `属性 ${k} 的值必须是 string`);
      if (k === 'href' || k === 'src') {
        const ub = checkUrlValue(v);
        if (ub) throw err('access', ub);
      }
      if (k === 'class') {
        for (const c of v.split(/\s+/)) {
          if (!c) continue;
          const cb = checkClassToken(c);
          if (cb) throw err('access', cb);
        }
      }
    }
    for (const [p, v] of Object.entries(node.style ?? {})) {
      const pb = checkStyleProp(p);
      if (pb) throw err('access', pb);
      const vb = checkStyleValue(p, v);
      if (vb) throw err('access', vb);
    }
    if (node.children !== undefined && !Array.isArray(node.children)) {
      throw err('access', 'children 必须是数组');
    }
    for (const c of node.children ?? []) one(c);
  };
  // 顶层接受单树或片段数组(模板渲染产物是片段数组)
  if (Array.isArray(tree)) {
    for (const n of tree) one(n);
  } else {
    one(tree);
  }
  return tree;
}

/** 树 → 真实 DOM(createElement/textContent/setAttribute,零字符串解析) */
export function materialize(tree, doc, onRef = null) {
  const one = (node) => {
    if (typeof node === 'string') return doc.createTextNode(node);
    const el = doc.createElement(node.tag);
    for (const [k, v] of Object.entries(node.attrs ?? {})) {
      if (k === 'ref') {
        if (onRef) onRef(v, el);
        continue; // ref 是宿主机制,不落 DOM 属性
      }
      if (k === 'class') {
        for (const c of v.split(/\s+/)) if (c) el.classList.add(c);
        continue;
      }
      el.setAttribute(k, v);
    }
    for (const [p, v] of Object.entries(node.style ?? {})) el.style.setProperty(p, v);
    for (const c of node.children ?? []) el.append(one(c));
    return el;
  };
  return one(tree);
}

/* ---------- UI 控制器 ---------- */

/**
 * @param {object} opts
 *   mount      挂载根元素(本控制器的句柄只能作用于其子树)
 *   doc        文档工厂(浏览器缺省 document;Node 测试传 DOM 垫片)
 *   onScriptError  沙盒事件回调抛出语言错误时通知宿主(AetherError 原样)
 * @returns {{ ui:object, mountTree(tree):refs, dispatch }}
 */
export function createUiController({ mount, doc, onScriptError }) {
  const document = doc ?? globalThis.document;
  const registry = new WeakMap(); // 句柄(函数)→ 元素
  const handlers = [];            // { remove } 事件解绑清单

  const mint = (el) => {
    const h = function $ref() { throw err('type', '句柄不可调用,仅供 ui.* 命令使用'); };
    registry.set(h, el);
    return h;
  };

  const inMount = (el) => {
    let n = el;
    while (n) {
      if (n === mount) return true;
      n = n.parentNode;
    }
    return false;
  };

  const resolve = (h) => {
    const el = registry.get(h);
    if (!el) throw err('access', '无效句柄(仅 ui.mount 产物可用)');
    if (!inMount(el)) throw err('access', '句柄已失效(元素已移出挂载根)');
    return el;
  };

  const asTag = (el) => String(el.tagName).toLowerCase();

  const ui = {
    text(h, s) { resolve(h).textContent = String(s); },
    attr(h, name, v) {
      const el = resolve(h);
      const bad = checkAttr(asTag(el), name);
      if (bad) throw err('access', bad);
      if (name === 'href' || name === 'src') {
        const ub = checkUrlValue(String(v));
        if (ub) throw err('access', ub);
      }
      if (name === 'class') {
        for (const c of String(v).split(/\s+/)) {
          if (!c) continue;
          const cb = checkClassToken(c);
          if (cb) throw err('access', cb);
        }
      }
      el.setAttribute(name, String(v));
    },
    style(h, prop, v) {
      const el = resolve(h);
      const pb = checkStyleProp(prop);
      if (pb) throw err('access', pb);
      const vb = checkStyleValue(prop, String(v));
      if (vb) throw err('access', vb);
      el.style.setProperty(prop, String(v));
    },
    cls(h, op, name) {
      const el = resolve(h);
      const cb = checkClassToken(String(name));
      if (cb) throw err('access', cb);
      if (op !== 'add' && op !== 'remove' && op !== 'toggle') {
        throw err('type', 'class 操作只接受 "add" | "remove" | "toggle"');
      }
      el.classList[op](String(name));
    },
    show(h) { resolve(h).style.setProperty('display', ''); },
    hide(h) { resolve(h).style.setProperty('display', 'none'); },
    append(h, tree) {
      const el = resolve(h);
      const list = Array.isArray(tree) ? tree : [tree];
      for (const n of list) validateTree(n);
      for (const n of list) el.append(materialize(n, document));
    },
    remove(h) { resolve(h).remove(); },
    on(h, type, fn) {
      const el = resolve(h);
      if (!EVENT_TYPES.has(type)) {
        throw err('access', `事件 "${type}" 不在白名单(${[...EVENT_TYPES].join(' ')})`);
      }
      if (typeof fn !== 'function') throw err('type', '事件回调必须是函数');
      const wrapped = (ev) => {
        // 事件数据快照跨界(规格 16.5/16.6),裸 Event 不进沙盒
        const data = {
          type: ev.type,
          key: ev.key,
          x: ev.clientX,
          y: ev.clientY,
          altKey: ev.altKey,
          ctrlKey: ev.ctrlKey,
        };
        try {
          fn(data);
        } catch (e) {
          onScriptError?.(e); // 语言错误以 AetherError 交给宿主
        }
      };
      el.addEventListener(type, wrapped);
      handlers.push({ el, type, wrapped });
    },
  };

  // 命令统一包装:语言级 AetherError 原样(→ 沙盒 catch 到 "access/type: …" 字符串),
  // 宿主意外异常不裸进沙盒(规格 10 边界同规)
  const guarded = {};
  for (const [k, f] of Object.entries(ui)) {
    guarded[k] = (...a) => {
      try {
        return f(...a);
      } catch (e) {
        if (e instanceof AetherError) throw e;
        throw err('host', e?.message ?? String(e));
      }
    };
  }

  return {
    ui: guarded,
    /** 宿主侧:验树 → 物化 → 挂载 → 返回 ref 句柄表(接受单树或片段数组) */
    mountTree(tree) {
      const list = Array.isArray(tree) ? tree : [tree];
      const refs = {};
      for (const n of list) {
        validateTree(n);
        const el = materialize(n, document, (name, node) => {
          if (name in refs) throw err('access', `ref "${name}" 重复`);
          refs[name] = mint(node);
        });
        mount.append(el);
      }
      return refs;
    },
    /** 测试/宿主辅助:移除全部事件监听 */
    dispose() {
      for (const { el, type, wrapped } of handlers) el.removeEventListener?.(type, wrapped);
      handlers.length = 0;
    },
  };
}
