/**
 * 编译样例并生成产物(规格 B.1/B.2):
 *   node tools/compile-examples.mjs
 *
 * - 语言样例 .ajs  → examples/compiled/<名>.mjs      (ES 模块产物)
 * - 模板 .tpl.html → examples/compiled/<名>.tpl.mjs  (渲染模块产物)
 * 然后跑通伪 SSR 链路:处理器(数据)→ 模板(渲染)→ HTML。
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, makeAether } from '../src/index.js';
import { compileTemplate, treeToHtml, withTemplateHelpers, checkHtml } from '../src/template.js';
import { importModule } from '../src/runtime.js';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
function dirname(p) { return p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))); }

const outDir = join(here, 'examples', 'compiled');
mkdirSync(outDir, { recursive: true });

/* ---------- 编译语言样例 ---------- */

for (const f of readdirSync(join(here, 'examples')).filter((x) => x.endsWith('.ajs'))) {
  const src = readFileSync(join(here, 'examples', f), 'utf8');
  const p = compile(src, { globals: ['print', 'ui'] });
  const out = join(outDir, f.replace(/\.ajs$/, '.mjs'));
  writeFileSync(out, p.code);
  console.log(`✓ ${f} → examples/compiled/${basename(out)}`);
}

/* ---------- 编译模板样例 ---------- */

for (const f of readdirSync(join(here, 'examples')).filter((x) => x.endsWith('.tpl.html'))) {
  const src = readFileSync(join(here, 'examples', f), 'utf8');
  const code = compileTemplate(src);
  const out = join(outDir, f.replace(/\.tpl\.html$/, '.tpl.mjs'));
  writeFileSync(out, code);
  console.log(`✓ ${f} → examples/compiled/${basename(out)}`);
}

/* ---------- 伪 SSR 链路演示:game-menu ---------- */

console.log('\n---- 伪 SSR 链路:game-menu.ajs → game-menu.tpl.html ----\n');

const out = [];
const handlerMod = await importModule(readFileSync(join(outDir, 'game-menu.mjs'), 'utf8'));
const data = await handlerMod.default(makeAether({ print: (...a) => out.push(a.join(' ')) }));
for (const l of out) console.log('[脚本输出]', l);

const tplMod = await importModule(readFileSync(join(outDir, 'game-menu.tpl.mjs'), 'utf8'));
const tree = await tplMod.default(withTemplateHelpers(makeAether(Object.create(null))), data);
const html = treeToHtml(tree);

console.log('\n[渲染 HTML]');
console.log(html);
console.log('\n[DOMParser 复检]', JSON.stringify(checkHtml(html)));
