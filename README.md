# AetherWebFramework

webos 的沙盒网站框架:**AetherJS 语言**(JavaScript 的安全子集,编译为 ES 模块产物,浏览器 Blob URL / Node data: URL 动态 import 加载,非 eval)+ **伪 SSR 模板引擎**(白名单文法 → IR → 类型化槽渲染)+ **Django 风格路由**(纯数据路由表)+ **DOM 控制通道**(能力句柄 + 窄命令集)。

命名:框架叫 **AetherWebFramework**(与 AetherWebOS / AetherWebDatabase 同族),作者写的语言叫 **AetherJS** —— Django 之于 Python 的关系。

规范文档:**[docs/language-spec-v0.2.md](docs/language-spec-v0.2.md)**(十三轮迭代定稿,含宿主框架与渲染边界、路由、实现方案调研)—— 语言与框架语义以该文档为准。

## 快速上手

```sh
node test/run.mjs              # 110 例:语义 / 编译拒绝 / 运行时拦截 / 模板边界
node tools/compile-examples.mjs # 编译样例,产物落 examples/compiled/,并跑通伪 SSR 链路
```

作为库:

```js
import { createRuntime } from './src/index.js';

const rt = createRuntime({ print: (s) => console.log(s) });
const value = await rt.run('print("hi"); 1 + 2;');   // 打印 hi,返回 3

// 伪 SSR:
import { compileTemplate, treeToHtml, withTemplateHelpers, makeAether } from './src/index.js';
const code = compileTemplate('<ul>{{#each it.items as i}}<li>{{i}}</li>{{/each}}</ul>');
const mod = await import(/* blob/data URL of code */);
const tree = await mod.default(withTemplateHelpers(makeAether(Object.create(null))), { items: [1, 2] });
treeToHtml(tree);  // <ul><li>1</li><li>2</li></ul>
```

## 安全模型(五层,规格 11)

编译期标识符白名单 → 语法禁用总表(`==`/`var`/`this` 于类外/模板串/…) → 属性类型分派(null 原型对象,原型链结构上不存在)→ 严格运算符类型检查 → 宿主边界隔离(数据深拷贝快照、异常字符串化、返回值深拷贝)。

模板侧(规格 16):白名单文法(严于 HTML)→ 类型化槽(href/src 校验非转义、禁外部资源)→ 三层事后检测(DOMParser 复检 / MutationObserver / CSP)。

## 目录

```
src/      lexer parser analyze codegen(语言)runtime(边界)template(模板引擎)errors
test/     110 例测试
examples/ .ajs 语言样例、.tpl.html 模板样例、compiled/ 编译产物
tools/    compile-examples.mjs(产物生成 + 伪 SSR 演示)
docs/     language-spec-v0.2.md(规范,唯一事实来源)
```

## License

MIT
