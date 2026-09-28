/**
 * DOM 控制通道演示(规格 16.6):声明式结构 + 命令式更新。
 * node tools/dom-demo.mjs
 *
 * 链路:模板(ref 声明)→ 渲染 → mountTree 铸句柄 → 程序 init(refs)
 *       → 事件回调里 ui.text/style/cls 就地改 DOM → 垫片上验证结果
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, makeAether, compile } from '../src/index.js';
import { compileTemplate, withTemplateHelpers } from '../src/template.js';
import { importModule } from '../src/runtime.js';
import { createUiController } from '../src/ui.js';
import { createDoc } from '../test/domshim.mjs';

const here = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const tplSrc = readFileSync(join(here, 'examples', 'hud.tpl.html'), 'utf8');
const progSrc = readFileSync(join(here, 'examples', 'hud.ajs'), 'utf8');

/* 编译并落产物 */
const tplCode = compileTemplate(tplSrc);
const prog = compile(progSrc, { globals: ['ui'] });
writeFileSync(join(here, 'examples', 'compiled', 'hud.tpl.mjs'), tplCode);
writeFileSync(join(here, 'examples', 'compiled', 'hud.mjs'), prog.code);
console.log('✓ 产物已写入 examples/compiled/hud.mjs 与 hud.tpl.mjs\n');

/* 宿主装配:垫片 DOM + 控制器 + 运行时 */
const doc = createDoc();
const root = doc.makeRoot();
const scriptErrors = [];
const ctl = createUiController({ mount: root, doc, onScriptError: (e) => scriptErrors.push(e) });
const rt = createRuntime({ ui: ctl.ui });

/* 1. 渲染模板树 → 挂载 → 拿 refs */
const tplMod = await importModule(tplCode);
const tree = await tplMod.default(withTemplateHelpers(makeAether(Object.create(null))), {});
const refs = ctl.mountTree(tree);

/* 2. 运行程序,拿 init(refs) */
const init = await rt.run(progSrc);
init(refs);

/* 3. 模拟玩家:治疗 ×5、受击 ×3 */
const find = (tag) => root.children[0].children.find((c) => c.tagName === tag.toUpperCase());
const heal = () => root.children[0].children.flatMap((c) => c.children ?? [])
  .find((c) => c.tagName === 'A' && c.getAttribute('href') === 'act/heal');
const hit = () => root.children[0].children.flatMap((c) => c.children ?? [])
  .find((c) => c.tagName === 'A' && c.getAttribute('href') === 'act/hit');

for (let i = 0; i < 5; i++) heal().dispatch('click');
console.log('[治疗×5]', find('p').textContent, '| class:', find('p').classList.toString());
for (let i = 0; i < 3; i++) hit().dispatch('click');
console.log('[受击×3]', find('p').textContent, '| 颜色:', find('p').styleProps.get('color'));

console.log('\n[DOM 状态]');
console.log(root.children[0].dump());
console.log('\n[脚本错误]', scriptErrors.length ? scriptErrors.map(String) : '无');
