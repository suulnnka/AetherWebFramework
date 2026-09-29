/**
 * AetherJS Worker 后端 · Node 薄壳(worker_threads;无顶层 await,同步完成消息注册)。
 * 本文件含 node: 静态导入,只在 Node 侧由 worker-host 加载,浏览器走 worker-boot.mjs。
 */
import { parentPort } from 'node:worker_threads';
import { startWorkerBackend } from './worker-core.js';

startWorkerBackend({
  post: (m) => parentPort.postMessage(m),
  register: (fn) => { parentPort.on('message', fn); },
});
