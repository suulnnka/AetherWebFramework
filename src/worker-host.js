/**
 * AetherJS Worker 后端 · 宿主侧(规格第 18 轮:后端执行进 Worker)。
 *
 * 后端脚本(路由处理函数、未来的 node 式脚本执行)在 Worker 内运行:
 * - Node 走 worker_threads,浏览器走 module Worker(同一份 worker-boot.mjs);
 * - 数据经结构化克隆跨界,与规格 10 的快照边界同构,函数不过界;
 * - 超时(可按调用覆盖)→ terminate 强制终止 + 惰性重生,死循环杀得掉;
 * - print 输出经单向消息转发(onLog)。
 *
 * 注意:本模块不进 src/index.js 导出(避免把 node:worker_threads 静态拖进浏览器打包),
 * 按需 `import { createWorkerBackend } from './worker-host.js'`。
 */

import { AetherError } from './errors.js';

const BOOT_URL = new URL('./worker-boot.mjs', import.meta.url);
const BOOT_NODE_URL = new URL('./worker-boot-node.mjs', import.meta.url);

/**
 * @param {object} opts
 *   timeoutMs  默认每次调用的超时毫秒(0 = 不限时);超时 terminate 后惰性重生
 *   onLog(text) print 输出转发
 * @returns {{ load(source, timeoutMs?), call(source, args, progress, timeoutMs?), terminate() }}
 */
export async function createWorkerBackend(opts = {}) {
  let Ctor;
  let workerSrc;
  let workerOpts;
  if (typeof Worker === 'function') {
    Ctor = Worker; // 浏览器 module Worker
    workerSrc = BOOT_URL;
    workerOpts = { type: 'module' };
  } else {
    ({ Worker: Ctor } = await import('node:worker_threads')); // Node worker_threads
    workerSrc = BOOT_NODE_URL;
    workerOpts = undefined;
  }

  let worker = null;
  let alive = false;
  let seq = 0;
  const pending = new Map(); // id → { resolve, reject, timer }

  const kill = (reason) => {
    if (!alive) return;
    alive = false;
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new AetherError('limit', reason));
    }
    pending.clear();
    const w = worker;
    worker = null;
    try { w.terminate(); } catch { /* 已退出 */ }
  };

  const spawn = () => {
    const w = new Ctor(workerSrc, workerOpts);
    worker = w;
    alive = true;
    const handle = (m) => {
      if (worker !== w) return; // 过时实例的事件(terminate 后迟到)忽略
      if (!m) return;
      if (m.type === 'log') { opts.onLog?.(m.text); return; }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.value);
      else p.reject(new AetherError(m.kind, m.message));
    };
    if (typeof w.on === 'function') {
      w.on('message', (m) => handle(m));
      w.on('error', (e) => { if (worker === w) kill(`Worker 异常退出:${e?.message ?? e}`); });
      w.on('exit', () => { if (worker === w) kill('Worker 已退出'); });
    } else {
      w.onmessage = (e) => handle(e.data);
      w.onerror = () => { if (worker === w) kill('Worker 异常退出'); };
    }
  };

  const request = (msg, timeoutMs = opts.timeoutMs) => new Promise((resolve, reject) => {
    if (!alive) spawn();
    const id = ++seq;
    const rec = { resolve, reject, timer: null };
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      rec.timer = setTimeout(() => kill(`执行超时(${timeoutMs}ms),已强制终止 Worker`), timeoutMs);
    }
    pending.set(id, rec);
    worker.postMessage({ ...msg, id });
  });

  return {
    /** 编译 + 验证程序返回函数(挂载校验;失败以 AetherError 拒绝) */
    load: (source, timeoutMs) => request({ type: 'load', source }, timeoutMs),
    /** 调用处理函数(args/progress 克隆入,value 克隆出,不得含函数) */
    call: (source, args, progress, timeoutMs) => request({ type: 'run', source, args, progress }, timeoutMs),
    /** 终止 Worker(进程退出/宿主关闭时调用,未决调用以 limit 错误拒绝) */
    terminate: () => kill('Worker 已被宿主终止'),
  };
}
