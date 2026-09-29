/**
 * AetherJS Worker 后端 · 浏览器薄壳(无顶层 await,同步完成消息注册)。
 * 环境判据:浏览器 Worker 里 self.postMessage 是函数;Node worker_threads 无 self。
 */
import { startWorkerBackend } from './worker-core.js';

startWorkerBackend({
  post: (m) => self.postMessage(m),
  register: (fn) => { self.onmessage = (e) => fn(e.data); },
});
