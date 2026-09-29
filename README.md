# AetherWebFramework

webos 的沙盒网站框架:**AetherJS 语言**(JavaScript 的安全子集,编译为 ES 模块产物,浏览器 Blob URL / Node data: URL 动态 import 加载,非 eval)+ **伪 SSR 模板引擎**(白名单文法 → IR → 类型化槽渲染)+ **Django 风格路由**(纯数据路由表 + `condition` 进度条件 + 路径/子域通配,按序优先匹配)+ **DOM 控制通道**(能力句柄 + 窄命令集)。

命名:框架叫 **AetherWebFramework**(与 AetherWebOS / AetherWebDatabase 同族),作者写的语言叫 **AetherJS** —— Django 之于 Python 的关系。

规范文档:**[docs/language-spec-v0.2.md](docs/language-spec-v0.2.md)**(十三轮迭代定稿,含宿主框架与渲染边界、路由、实现方案调研)—— 语言与框架语义以该文档为准。

## 快速上手

```sh
node test/run.mjs              # 153 例:语义 / 编译拒绝 / 运行时拦截 / 模板边界 / 路由 / 安全回归 / Worker 后端
node tools/compile-examples.mjs # 编译样例,产物落 examples/compiled/,并跑通伪 SSR 链路
node tools/dom-demo.mjs         # DOM 控制通道演示(规格 16.6)
node tools/search-demo.mjs      # 类 Google 搜索引擎示例:纯 HTML 首页 + 伪 SSR 结果页 + 实时搜索
node tools/router-demo.mjs      # 伪后端路由演示:condition 叠层路由 + 混型条件(视为不成立 + 日志)+ 兜底
npm run start ./demo/google     # dev 服务器(默认 3010):浏览器访问 http://localhost:3010/google.com/
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
src/      lexer parser analyze codegen(语言)runtime(边界)template(模板引擎)router(路由 + condition + 通配)errors
test/     153 例测试
demo/     google/ 类 Google 搜索引擎完整应用(router.ajs 路由表 + search.ajs 处理函数
          + home/results/doodles/notfound 模板 + progress.json 进度快照,供 npm run start 挂载)
examples/ .ajs 语言样例、.tpl.html 模板样例、compiled/ 编译产物
          search* 系列为类 Google 搜索引擎示例:首页(纯 HTML 模式)、结果页
          (伪 SSR 处理函数:打分排序 + 摘要高亮)、实时搜索(DOM 通道即输即搜)
tools/    compile-examples.mjs(产物生成 + 伪 SSR 演示)、dom-demo.mjs(DOM 通道演示)、
          search-demo.mjs(搜索引擎示例演示)、router-demo.mjs(路由与 condition 演示)、
          serve.mjs(dev 服务器:URL 首段 = 虚拟主机名,如 localhost:3010/google.com/search/?q=aether)
docs/     language-spec-v0.2.md(规范,唯一事实来源)
```

### dev 服务器(npm run start)

```sh
npm run start ./demo/google        # 默认端口 3010,可加第二个参数或 PORT 环境变量
```

浏览器访问 `http://localhost:3010/google.com/` —— **URL 第一段路径 = 虚拟主机名**,其余为路径与查询串,按规格 16.7 分发。根路径 `/` 列出路由表中的全部域名。应用目录约定:`router.ajs`(路由表)、`<名>.ajs`(处理函数)、`<名>.html`(模板)、`progress.json`(可选,condition 与处理函数读取的进度快照);模板内链接须用文档相对路径(`search/?q=a`),绝对路径会丢主机段。`print` 输出与路由日志在服务器控制台可见(dev 调试出口);**处理函数在 Worker 内执行**(默认 5s 超时强制终止,`SCRIPT_TIMEOUT_MS` 可调)——死循环杀得掉,不拖垮进程。

### Worker 后端(规格 18 轮)

后端脚本执行进 Worker,页面动态脚本(DOM 通道)留主线程。`src/worker-host.js` 提供 `createWorkerBackend()`(Node worker_threads / 浏览器 module Worker 双环境):消息协议即第 10 节边界的线程版——args/progress 结构化克隆入、返回值克隆出(函数不过界)、语言错误按 `{kind, message}` 回传、`print` 单向转发;`load()` 承担挂载校验(编译 + 验证返回函数),超时 `terminate` 后惰性重生。路由器经 `runScript` 执行器接入(见 `tools/serve.mjs`)。

## License

MIT
