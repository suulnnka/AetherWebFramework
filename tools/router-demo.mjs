/**
 * 伪后端路由演示(规格 16.7,含 condition 进度条件与通配):
 *   node tools/router-demo.mjs
 *
 * 一个小游戏站"迷城物语"的路由表,展示:
 * - 纯 HTML 模式(script 省略)与子域条目
 * - 路径参数(<number:level>)与处理函数(script + 模板索引)
 * - condition 叠层路由:顺序即优先级,条件不成立向下落
 * - 混型比较(score 是字符串)→ 条件视为不成立 + dev 日志,不炸分发
 * - 通配:path 末段 *(前缀认领子树)与 subdomain "*"(任意单级前缀),具体在前通配在后
 * - 同域 path:"*" 兜底与平台默认 404
 */

import { mountRouter } from '../src/index.js';

const logs = [];
const router = await mountRouter([
  { domain: 'mygame.os', path: '/', template: '<div id="home"><h1>迷城物语</h1><p><a href="level/1/">进入第 1 关</a> · <a href="ending/">结局</a> · <a href="status/">存档状态</a> · <a href="docs/guide/">文档</a></p></div>' },
  { domain: 'mygame.os', subdomain: 'wiki', path: '/', template: '<h1>迷城百科</h1><p>具体子域条目(wiki.mygame.os,排在 subdomain 通配之前)</p>' },
  { domain: 'mygame.os', subdomain: '*', path: '/', template: '<p>租户子域通配页(subdomain: "*",任意单级前缀)</p>' },
  { domain: 'mygame.os', path: '/docs/api/', template: '<h1>API 文档</h1><p>具体路径,排在 /docs/* 通配之前</p>' },
  { domain: 'mygame.os', path: '/docs/*', template: '<h1>文档子树</h1><p>path 末段 * 前缀认领:/docs/ 下除具体条目外的全部页面</p>' },
  { domain: 'mygame.os', path: '/level/<number:level>/', condition: 'chapter >= 3', script: 'quest', template: 'quest.html' },
  { domain: 'mygame.os', path: '/level/<number:level>/', template: '<p>尚未解锁:需要 chapter &gt;= 3(当前进度的章节不够)</p>' },
  { domain: 'mygame.os', path: '/status/', script: 'status', template: '<p>存档:{{it.name}} · 得分 {{it.score}} · 第 {{it.chapter}} 章</p>' },
  { domain: 'mygame.os', path: '/ending/', condition: 'score > 9', template: '<h1>黄金结局</h1><p>条件命中:score 大于 9</p>' },
  { domain: 'mygame.os', path: '/ending/', condition: 'score > 3', template: '<h1>普通结局</h1><p>条件命中:score 大于 3 且不超过 9</p>' },
  { domain: 'mygame.os', path: '/ending/', template: '<h1>坏结局</h1><p>兜底:score 不超过 3</p>' },
  { domain: 'mygame.os', path: '*', template: '<h1>404</h1><p>迷城里没有这条路(作者自定义兜底页)。</p>' },
  { domain: '127.0.0.1', path: '/', template: '<p>本地调试页(IP 主机条目)</p>' },
], {
  log: (m) => logs.push(m),
  loadScript: async (name) => ({
    status: 'return (args, progress) => { return { template: 0, data: { name: progress.name, score: progress.score, chapter: progress.chapter } }; };',
    quest: 'return (args, progress) => { return { template: 0, data: { level: args.level } }; };',
  }[name]),
  loadTemplate: async (name) => ({
    'quest.html': '<div id="quest"><h1>第 {{it.level}} 关:星之塔</h1><p>条件路由解锁(chapter >= 3)</p></div>',
  }[name]),
});

const show = async (label, url, progress) => {
  const res = await router.dispatch(url, progress);
  const brief = res.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  console.log(`${label}\n  ${url}  progress=${JSON.stringify(progress)}\n  → ${res.status} ${res.status === 200 ? '' : '| '}${brief}\n`);
};

console.log('---- 迷城物语:路由分发(condition 叠层 + 通配)----\n');

await show('[首页 · 纯 HTML 模式]', 'https://mygame.os/', {});
await show('[子域具体条目(排在通配之前)]', 'https://wiki.mygame.os/', {});
await show('[子域通配:任意单级前缀]', 'https://alice.mygame.os/', {});
await show('[子域通配:多级前缀不命中]', 'https://a.b.mygame.os/', {});
await show('[子树具体条目(排在 /docs/* 之前)]', 'https://mygame.os/docs/api/', {});
await show('[子树通配:/docs/* 前缀认领]', 'https://mygame.os/docs/guide/intro/', {});
await show('[条件不成立 → 落到下一条]', 'https://mygame.os/level/2/', { chapter: 2 });
await show('[条件成立 → 解锁页(路径参数为数字)]', 'https://mygame.os/level/2/', { chapter: 5 });
await show('[script 处理函数读 progress]', 'https://mygame.os/status/', { name: 'Alice', score: 7, chapter: 4 });
await show('[叠层条件 score=12]', 'https://mygame.os/ending/', { score: 12 });
await show('[叠层条件 score=5]', 'https://mygame.os/ending/', { score: 5 });
await show('[叠层条件 score=1]', 'https://mygame.os/ending/', { score: 1 });
await show('[混型:score 是字符串 "12" → 条件视为不成立 + 日志]', 'https://mygame.os/ending/', { score: '12' });
await show('[同域 * 兜底]', 'https://mygame.os/no-such-page/', {});
await show('[IP 主机条目]', 'http://127.0.0.1/', {});
await show('[未挂载的域名 → 平台默认 404]', 'https://other.os/', {});

console.log('---- dev 日志(condition 求值错误,视为不成立)----');
console.log(logs.length ? logs.map((l) => '  ' + l).join('\n') : '  无');
