/**
 * 类 Google 搜索引擎示例演示:
 *   node tools/search-demo.mjs
 *
 * 1) 纯 HTML 首页(search-home.tpl.html,路由 script 省略,规格 16.7)
 * 2) 伪 SSR 结果页:search.ajs 处理函数(16.7 契约 args → { template, data })
 *    → search-results.tpl.html 渲染 → HTML(浏览器侧另有 DOMParser 复检,规格 16.4)
 * 3) 实时搜索:search-live.ajs + DOM 控制通道(16.6),垫片 DOM 上模拟敲键,
 *    搜索框/统计行/结果区全部由 ui.* 命令就地更新
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, makeAether } from '../src/index.js';
import { compileTemplate, treeToHtml, withTemplateHelpers, checkHtml } from '../src/template.js';
import { importModule } from '../src/runtime.js';
import { createUiController } from '../src/ui.js';
import { createDoc } from '../test/domshim.mjs';

const here = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (name) => readFileSync(join(here, 'examples', name), 'utf8');
const renderTpl = async (name, data) => {
  const mod = await importModule(compileTemplate(read(name)));
  const tree = await mod.default(withTemplateHelpers(makeAether(Object.create(null))), data);
  return treeToHtml(tree);
};

/* ---------- 1) 纯 HTML 首页 ---------- */

console.log('---- 1) 纯 HTML 首页(search-home.tpl.html,script 省略 = 静态页)----\n');
{
  const html = await renderTpl('search-home.tpl.html', {});
  console.log(html);
  console.log('[复检]', JSON.stringify(checkHtml(html)));
}

/* ---------- 2) 伪 SSR:处理函数 → 模板 → HTML ---------- */

console.log('\n---- 2) 伪 SSR 结果页(search.ajs → search-results.tpl.html)----\n');
{
  const rt = createRuntime({});                        // 语言全局 = 18 项内建,无宿主能力
  const handler = await rt.run(read('search.ajs'));    // 程序值 = (args, progress) => { template, data }

  const run = async (q) => {
    const { template, data } = handler({ q }, {});     // args:?q= 查询串参数;progress:进度快照
    const html = await renderTpl('search-results.tpl.html', data);
    return { template, data, html };
  };

  const first = await run('aether');
  console.log(`[查询] aether → template:${first.template},约 ${first.data.count} 条(标题命中加权排前)`);
  console.log('\n[渲染 HTML]');
  console.log(first.html.trimEnd());
  console.log('\n[复检]', JSON.stringify(checkHtml(first.html)));

  for (const q of ['aether 语言', '白名单', '一个不存在的词xyz']) {
    const r = await run(q);
    const titles = r.data.results.map((x) => x.title).join(' | ');
    console.log(`[查询] ${q} → ${r.data.count} 条${titles ? ':' + titles : ''}`);
  }
}

/* ---------- 3) 实时搜索:DOM 控制通道 ---------- */

console.log('\n---- 3) 实时搜索(search-live.ajs + DOM 控制通道,规格 16.6)----\n');
{
  const doc = createDoc();
  const root = doc.makeRoot();
  const scriptErrors = [];
  const ctl = createUiController({ mount: root, doc, onScriptError: (e) => scriptErrors.push(e) });
  const rt = createRuntime({ ui: ctl.ui });

  const tplMod = await importModule(compileTemplate(read('search-live.tpl.html')));
  const tree = await tplMod.default(withTemplateHelpers(makeAether(Object.create(null))), {});
  const refs = ctl.mountTree(tree);

  const init = await rt.run(read('search-live.ajs'));
  init(refs);

  // 垫片上按 id 找搜索框/统计行/结果区,模拟宿主把按键派发到搜索框
  const walk = (el) => [el, ...(el.children ?? []).flatMap(walk)];
  const byId = (id) => walk(root).find((n) => n.attrs && n.attrs.get('id') === id);
  const box = byId('qbox');
  const stats = byId('stats');
  const resultsEl = byId('results');
  const type = (s) => { for (const ch of s) box.dispatch('keydown', { key: ch }); };
  const press = (key) => box.dispatch('keydown', { key });
  const show = (label) => {
    console.log(`\n[${label}]`);
    console.log('  搜索框:', box.textContent);
    console.log('  统计行:', stats.textContent);
    for (const li of walk(resultsEl).filter((n) => n.tagName === 'LI')) {
      console.log('  -', li.children[1].textContent, '@', li.children[0].textContent);
    }
  };

  type('aether');
  show('敲入 aether(即输即搜)');
  type(' 沙盒');
  show('补一个词 → aether 沙盒(AND 语义,只剩同时命中两词的页)');
  press('Enter');
  show('Enter 定格');
  console.log('\n[DOM 状态]');
  console.log(root.children[0].dump());
  press('Escape');
  show('Esc 清空');

  console.log('\n[脚本错误]', scriptErrors.length ? scriptErrors.map(String) : '无');
}
