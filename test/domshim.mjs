/** Node 环境的最小 DOM 垫片:仅覆盖 ui.js 所需面(createElement/textContent/
 * classList/setAttribute/style.setProperty/append/remove/addEventListener) */

export function createDoc() {
  class TextNode {
    constructor(t) {
      this.text = t;
      this.parentNode = null;
    }
    get textContent() { return this.text; }
    set textContent(v) { this.text = v; }
  }

  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.attrs = new Map();
      this.children = [];
      this.parentNode = null;
      this._text = '';
      this._class = new Set();
      this.styleProps = new Map();
      this.listeners = new Map(); // type → [fn]
    }
    get classList() {
      const s = this._class;
      return {
        add: (c) => s.add(c),
        remove: (c) => s.delete(c),
        toggle: (c) => (s.has(c) ? s.delete(c) : s.add(c)),
        contains: (c) => s.has(c),
        toString: () => [...s].join(' '),
      };
    }
    get style() {
      const m = this.styleProps;
      return { setProperty: (p, v) => m.set(p, v) };
    }
    setAttribute(k, v) { this.attrs.set(k, v); }
    getAttribute(k) { return this.attrs.get(k); }
    get textContent() {
      return this._text + this.children.map((c) => c.textContent).join('');
    }
    set textContent(v) { this._text = String(v); this.children = []; }
    append(n) {
      if (this._text) this._text = '';
      n.parentNode = this;
      this.children.push(n);
    }
    remove() {
      const p = this.parentNode;
      if (p) {
        const i = p.children.indexOf(this);
        if (i >= 0) p.children.splice(i, 1);
        this.parentNode = null;
      }
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this.listeners.get(type) ?? [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
    /** 测试辅助:派发事件 */
    dispatch(type, ev = {}) {
      for (const fn of [...(this.listeners.get(type) ?? [])]) {
        fn({ type, key: undefined, clientX: 0, clientY: 0, altKey: false, ctrlKey: false, ...ev });
      }
    }
    /** 测试辅助:渲染为调试串 */
    dump(ind = 0) {
      const pad = '  '.repeat(ind);
      const attrs = [...this.attrs].map(([k, v]) => ` ${k}="${v}"`).join('');
      const cls = this._class.size ? ` class="${[...this._class].join(' ')}"` : '';
      const st = this.styleProps.size
        ? ` style="${[...this.styleProps].map(([p, v]) => `${p}:${v}`).join(';')}"` : '';
      if (this.children.length === 0 && !this._text) return `${pad}<${this.tagName}${attrs}${cls}${st}/>`;
      const inner = this._text + this.children.map((c) => (c instanceof El ? '\n' + c.dump(ind + 1) : c.textContent)).join('');
      return `${pad}<${this.tagName}${attrs}${cls}${st}>${inner}${this.children.some((c) => c instanceof El) ? '\n' + pad : ''}</${this.tagName}>`;
    }
  }

  return {
    createElement: (t) => new El(t),
    createTextNode: (t) => new TextNode(t),
    Element: El,
    makeRoot: () => new El('root'),
  };
}
