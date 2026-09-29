/**
 * AetherJS Worker 后端 · 共享核心(规格 18 轮)。
 * 双环境薄壳(worker-boot.mjs / worker-boot-node.mjs)注入 post/register,
 * 本模块在**同步求值内**完成消息注册 —— 不用顶层 await:模块求值挂起期间
 * 到达的消息会被部分实现丢弃(实测 Chromium 行为),同步注册则按规范排队。
 *
 * 协议(结构化克隆,与规格 10 快照边界同构 —— 数据克隆跨界、函数不过界):
 *   → {id, type:'load', source}                  编译 + 验证程序返回函数(挂载校验)
 *   → {id, type:'run', source, args, progress}   调用处理函数
 *   ← {id, ok:true, value} | {id, ok:false, kind, message}
 *   ← {type:'log', text}                         print 输出(单向,无返回值故可异步)
 */

import { compile, makeAether } from './runtime.js';
import { AetherError } from './errors.js';

export function startWorkerBackend({ post, register }) {
  const programs = new Map(); // source → 处理函数(编译一次)
  const print = (...a) => post({ type: 'log', text: a.join(' ') });

  async function entryOf(source) {
    if (!programs.has(source)) {
      const prog = compile(source, { globals: ['print'] }); // Worker 模式下唯一宿主能力
      const mod = await prog.load();
      const fn = mod.default(makeAether({ print }));
      if (typeof fn !== 'function') {
        throw new AetherError('syntax', '程序返回值必须是函数(16.7 处理函数契约)');
      }
      programs.set(source, fn);
    }
    return programs.get(source);
  }

  const errShape = (e) => (e instanceof AetherError
    ? { kind: e.kind, message: e.message }
    : { kind: 'host', message: String(e?.message ?? e) });

  register(async (msg) => {
    if (!msg || (msg.type !== 'load' && msg.type !== 'run')) return;
    try {
      const fn = await entryOf(msg.source);
      if (msg.type === 'load') {
        post({ id: msg.id, ok: true, value: null });
        return;
      }
      const value = fn(msg.args ?? {}, msg.progress ?? {});
      post({ id: msg.id, ok: true, value });
    } catch (e) {
      post({ id: msg.id, ok: false, ...errShape(e) });
    }
  });
}
