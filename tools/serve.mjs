/**
 * Aether dev 服务器:把伪后端路由挂到真实 HTTP 上(dev 工具,非生产)。
 *   npm run start ./demo/google         # 默认端口 3010
 *   npm run start ./demo/google 3020    # 或 PORT=3020 npm run start ./demo/google
 *
 * URL 约定:**第一段路径 = 虚拟主机名**,其余为虚拟路径与查询串:
 *   http://localhost:3010/google.com/search/?q=aether
 *     → 路由分发按 google.com/search/?q=aether 进行(规格 16.7)
 * 服务器根路径 / 列出路由表里的全部域名。
 * 注意:模板只能用文档相对链接(search/?q=a、../ending/);绝对路径 /x 会丢掉
 * 主机段落到根页 —— 这与模板白名单"仅相对路径"的约束(16.3)正好一致。
 *
 * 应用目录约定:
 *   router.ajs     路由表(程序返回值 = 纯数据数组,规格 16.7)
 *   <名>.ajs       处理函数(script 字段引用;<名> 即文件名去掉 .ajs)
 *   <名>.html      模板(template 字段引用的文件)
 *   progress.json  可选,进度快照(condition 与处理函数读取;渲染只读)
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createRuntime, mountRouter } from '../src/index.js';
import { createWorkerBackend } from '../src/worker-host.js';

const argv = process.argv.slice(2);
const appDir = argv[0];
if (!appDir) {
  console.error('用法:npm run start <应用目录> [端口]\n例如:npm run start ./demo/google');
  process.exit(1);
}
const port = Number(argv[1] ?? process.env.PORT ?? 3010);

const readUtf8 = (p) => readFileSync(p, 'utf8');
// 装载围栏:script/模板名只允许落在应用目录内(防路由表用 ../ 越出应用目录)
const appRoot = resolve(appDir);
const inApp = (p) => {
  const r = resolve(p);
  return r === appRoot || r.startsWith(appRoot + sep);
};
const tryRead = (p) => {
  if (!inApp(p)) return null; // → 挂载校验报"无法载入"(规格 16.7)
  try { return readUtf8(p); } catch { return null; }
};

/* 1. 载入路由表:router.ajs 的程序返回值(纯数据) */
const routes = await createRuntime({}).run(readUtf8(join(appDir, 'router.ajs')));
if (!Array.isArray(routes)) {
  console.error('挂载失败:router.ajs 的返回值必须是路由表数组(纯数据,规格 16.7)');
  process.exit(1);
}

/* 2. 进度快照(可选 progress.json) */
const progressPath = join(appDir, 'progress.json');
const progress = existsSync(progressPath) ? JSON.parse(readUtf8(progressPath)) : {};

/* 3. 挂载:script/模板按文件名解析到应用目录;处理函数在 Worker 内执行
 *    (规格 18 轮:后端执行进 Worker,超时 terminate,死循环杀得掉;print 单向转发) */
const backend = await createWorkerBackend({
  timeoutMs: Number(process.env.SCRIPT_TIMEOUT_MS ?? 5000),
  onLog: (t) => console.log('[print]', t),
});
const router = await mountRouter(routes, {
  loadScript: async (name) => tryRead(join(appDir, `${name}.ajs`)),
  loadTemplate: async (name) => tryRead(join(appDir, name)),
  runScript: { load: (s) => backend.load(s), call: (s, a, p) => backend.call(s, a, p) },
  log: (m) => console.warn('[router]', m),
});

const domains = [...new Set(routes.map((r) => r?.domain).filter(Boolean))];

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/favicon.ico') { res.writeHead(404).end(); return; }

    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length === 0) {
      const items = domains.map((d) => `<li><a href="/${d}/">${d}</a></li>`).join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Aether dev</title>`
        + `<h1>Aether dev 服务器</h1><p>已挂载 ${routes.length} 条路由(应用:${appDir}),域名:</p>`
        + `<ul>${items}</ul><p style="color:#888">URL 约定:第一段路径是虚拟主机名,如 /${domains[0] ?? 'host'}/search/?q=…</p>`);
      return;
    }

    const vhost = segs[0];
    if (!/^[A-Za-z0-9.-]+$/.test(vhost)) { res.writeHead(404).end('404'); return; }
    const rest = '/' + segs.slice(1).join('/');
    const out = await router.dispatch(`http://${vhost}${rest}${u.search}`, progress);
    res.writeHead(out.status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(out.html);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`500 ${e?.message ?? e}`);
  }
});

server.listen(port, () => {
  console.log(`Aether dev 服务器已启动:http://localhost:${port}/`);
  for (const d of domains) console.log(`  http://localhost:${port}/${d}/`);
  console.log(`  处理函数在 Worker 内执行(超时 ${Number(process.env.SCRIPT_TIMEOUT_MS ?? 5000)}ms 强制终止,可用 SCRIPT_TIMEOUT_MS 调整)`);
  if (existsSync(progressPath)) {
    console.log(`  进度快照 progress.json = ${JSON.stringify(progress)}(改一改再刷新,可看 condition 生效)`);
  }
});

process.on('SIGINT', () => {
  backend.terminate();
  server.close(() => process.exit(0));
});
