# AetherWebFramework 规格文档(语言:AetherJS v0.2)(定稿)

> **项目**:AetherWebFramework —— webos 的沙盒网站框架(与 AetherWebOS / AetherWebDatabase 同族);**语言**:AetherJS v0.2,Django 之于 Python 的关系。
> **状态**:规格与实现同步 —— 语言、模板引擎、DOM 控制通道、伪后端路由(16.7,含 condition 与通配)均已实现;后端脚本执行已 Worker 化(18 轮)。`src/`,153 例测试。
> **定稿时间**:2026-09-28,经十八轮迭代收敛(第 11 轮:实现落地;第 12 轮:DOM 控制通道;第 13 轮:伪后端路由;第 14 轮:路由实现落地 + condition 进度条件;第 15 轮:路由通配;第 16 轮:安全审查修复;第 17 轮:DOM 通道脚本定案主线程;第 18 轮:后端执行进 Worker)。
> **子集原则**(第 5 轮确立):AetherJS 是 JS 的子集 —— 保留的特性行为必须与 JS 一致;与 JS 不一致的用法只能**砍掉**(编译错),不能改写语义。

## 0. 定位与非目标

AetherJS 是 webos 执行不可信/半可信脚本的**过滤器语言**:类 JS 语法 → 编译为受控 JS。
用户写代码做简单运算、简单任务;语言层禁止一切隐式行为,安全性靠语言本身而不是运行时围栏。

**非目标**:完整 JS 兼容、异步、I/O、高性能、表达力。

## 1. 设计原则

1. **子集原则**:保留即 JS 一致,不一致即砍(编译错),绝不改语义。
2. **显式优于隐式**:隐式类型转换、隐式插入、隐式继承,一律不存在。
3. **读取宽松、运算严格**:缺键/越界读取返回 `undefined`、除零得 `Infinity`(JS 手感);所有运算符与条件位置严格类型检查,违者运行时报错。
4. **结构上无原型**:对象一律 null 原型 —— 原型链逃逸不是被拦截,是**结构上不存在**。

## 2. 值系统(8 种)

`number`(IEEE754 双精度)、`string`(UTF-16)、`boolean`、`null`、`undefined`、`array`、`object`(null 原型的纯数据字典)、`function`。

- `undefined` 是正式的值:缺键读取、越界下标、无返回函数的结果
- **class 实例是 object**(null 原型,字段+方法引用在自有键上);**class 本身是 function**(`typeOf(class) === "function"`,但直接调用类名报错,必须 `new` —— 与 JS 一致)
- 数组无空洞:写下标必须 `0 <= i <= length`(等于即追加);负数下标读/写、越界写均为 `range` 错;`arr.length = n` 仅允许收缩(截断),扩张抛错
- 如实保留的 IEEE 行为(文档标注):`NaN !== NaN`、`0.1 + 0.2` 精度、`1/0 === Infinity`、`0/0 === NaN`、上溢得 `Infinity`

## 3. 文法(EBNF)

```
Program  → Stmt*
Stmt     → LetDecl | FuncDecl | ClassDecl | If | While | For | ForOf
          | "break" ";" | "continue" ";" | "return" Expr? ";" | "throw" Expr ";"
          | Try | Block | ExprStmt
LetDecl  → ("let"|"const") ID "=" Expr ("," ID "=" Expr)* ";"    // 必须初始化(值为表达式,非赋值)
FuncDecl → "function" ID "(" Params? ")" Block
ClassDecl→ "class" ID "{" ClassMember* "}"
ClassMember → FieldDecl | MethodDecl | ConstructorDecl
FieldDecl    → ID ("=" Assign)? ";"                    // JS class fields 语法
MethodDecl   → ID "(" Params? ")" Block                // 无 function 关键字(JS 一致)
ConstructorDecl → "constructor" "(" Params? ")" Block  // 每类至多一个
If       → "if" "(" Expr ")" Stmt ("else" Stmt)?
While    → "while" "(" Expr ")" Stmt
For      → "for" "(" (LetDecl¹ | Assign¹ | ε) ";" Expr? ";" (Assign¹|Update¹)? ")" Stmt
ForOf    → "for" "(" ("let"|"const") ID "of" Expr ")" Stmt
Try      → "try" Block "catch" "(" ID ")" Block                       // 无 finally
ExprStmt → Expr ";"                                                     // Expr 不含赋值
Block    → "{" Stmt* "}"

Expr → Ternary
Ternary → Or ("?" Expr ":" Ternary)?          // test 须 boolean;分支为表达式(非赋值)
Or → And ("||" And)*
And → Eq ("&&" Eq)*                              // && || 仅 boolean 进出
Eq → Rel (("==="|"!==") Rel)*
Rel → BitOr (("<"|"<="|">"|">=") BitOr)*
BitOr → Xor ("|" Xor)*
Xor → Band ("^" Band)*
Band → Shift ("&" Shift)*
Shift → Add (("<<"|">>"|">>>") Add)*
Add → Mul (("+"|"-") Mul)*
Mul → Pow (("*"|"/"|"%") Pow)*
Pow → Unary ("**" Pow)?                          // 右结合
Unary → ("-"|"!"|"~") Unary | ("++"|"--") Unary | Postfix    // 无一元 +
Postfix → Primary (("++"|"--") | "." ID | "[" Expr "]" | "(" Args ")")*
Primary → NUM | STR | "true" | "false" | "null" | "undefined"
         | ID | "this"² | "(" Expr ")"
         | ArrayLit | ObjectLit
         | "function" ID? "(" Params ")" Block
         | "(" Params ")" "=>" Body | ID "=>" Body
         | "new" MemberExpr "(" Args? ")"        // new 仅作用于类,实参括号必填
MemberExpr → Primary ("." ID | "[" Expr "]")*    // 不含调用的后缀链
ArrayLit → "[" (Expr ("," Expr)* ","?)? "]"
ObjectLit → "{" ((ID|STR) ":" Expr ("," …)* ","?)? "}"
```

¹ for 头是唯一允许"声明/赋值/自增"出现的表达式槽位;**赋值在其他任何表达式位置都是语法错**(`if (x = 1)` 不存在,链式赋值不存在)。`++/--` 仍是表达式。

² `this` 仅在**类成员体**(constructor/方法/字段初始值)及其内部嵌套的箭头函数里是合法表达式;其他任何位置 = 语法错(这是砍,不是改)。`this` 不能作赋值或 `++/--` 的目标。

词法约定:

- 分号必填,无 ASI
- 注释 `//` 行注释、`/* */` 块注释(不嵌套)
- 标识符 `[A-Za-z_][A-Za-z0-9_]*`,纯 ASCII,不含 `$`
- 字符串单/双引号,转义 `\n \t \r \b \f \v \0 \' \" \\ \xNN \uXXXX`
- 数字支持 `0x 0b 0o` 前缀与指数记数,`1e999` → `Infinity`
- 对象字面量键仅允许标识符/字符串(禁数字键),重复键 = 编译错;尾逗号允许

## 4. 运算符语义(全严格)

| 运算 | number,number | string,string | 其他组合 |
|---|---|---|---|
| `+` | 求和 | 拼接 | 运行时 `type` 错(显式转换用 `num()` / `str()`) |
| `- * / % **`、位运算 `& \| ^ ~ << >> >>>` | 正常 | — | `type` 错 |
| `< <= > >=` | 数值序 | UTF-16 码元序 | `type` 错 |
| `=== !==` | 值比较 | 值比较 | 任意类型可比:异类型恒 false/true;对象/数组/函数比引用 |
| `&& \|\| !` | — | — | 仅 boolean 进出;短路保证(`false && f()` 不调用 f) |
| 一元 `- ~`、`++ --` | 正常 | — | `type` 错 |
| 条件位(if / while / for / 三元 test) | — | — | 须为 boolean,否则 `type` 错 |

语义承诺:

- 求值顺序从左到右;短路求值有保证
- `-2 ** 2` 定义为 `(-2) ** 2`(JS 中是语法错,这里给确定语义)
- 复合赋值 `+= -= *= /= %= **= &= \|= ^= <<= >>= >>>=` 与对应二元运算同一套类型检查
- 常量折叠仅当操作数均为字面量、且折叠结果与运行时类型检查逐位一致时进行
- `for (;;)` 省略 test = 恒真

## 5. 语句与作用域

作用域规则:

1. **let/const 先声明后用**,违者编译错(静态 TDZ)
2. **函数声明在其所在函数/程序内提升** —— 例外,为互相递归保留
3. **class 声明不提升**(与 JS 一致,同 let/const 的先声明后用)

其余锁定项:

- let/const 必须显式初始化(`let x;` 编译错,写 `let x = undefined;`);类字段声明除外(见第 7 节)
- 给白名单全局赋值 = 编译错;**遮蔽白名单全局** = 编译错
- 同一作用域重复声明 = 编译错;类体内字段/方法重名、重复 constructor = 编译错
- for 头 let 声明每轮独立绑定(闭包语义与 JS let 一致)
- 空语句 `;` 不存在;循环体用 `{}`

## 6. 属性访问(接收者类型分派)

取代黑名单过滤,按接收者实际类型正向白名单:

| 接收者 | 可访问 | 缺失/越界 |
|---|---|---|
| string | `length` + `slice substring indexOf includes split replace repeat toUpperCase toLowerCase trim startsWith endsWith charAt charCodeAt padStart padEnd concat` | 表外方法名 → `access` 错 |
| array | `length` + `push pop shift unshift slice splice indexOf includes join map filter reduce forEach sort reverse concat every some find` | 同上 |
| object(null 原型) | 任意**自有**键 | 返回 `undefined` |
| function | **无任何属性**(class 值的 `prototype`/`call`/`apply` 同样不可达) | 访问即 `access` 错 |
| number / boolean / null / undefined | 无属性 | `access` 错 |

- 动态键 `o[k]` 与点访问走同一运行时策略
- 对象由运行时以 null 原型构造(含 `JSON.parse` 结果):`constructor`/`__proto__` **结构上不存在**
- **number 与 object 都没有方法**:number 零方法(`toFixed`/`toString` 等不存在,用 `Math.*`/`fixed`/`str` 内建函数);object 零继承面,只有自有键读写。对象可以持有函数值并通过键调用,不构成特殊"方法"语义(成员调用的接收者绑定见第 7 节)
- **调用目标必须是 function 值**,否则 `type: 调用非函数值`(不是引擎裸 TypeError)
- 原生方法回调(如 `map` 传入的函数)的返回值不经过类型检查,文档标注

## 7. 类(class)

### 7.1 语法与构造

```
class Point {
  x = 0;                          // 字段声明(JS class fields 语法,可省默认值)
  y = 0;
  constructor(x0, y0) {
    this.x = x0;
    this.y = y0;
  }
  dist(other) {                   // 方法:JS 语法,无 function 关键字
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

const p = new Point(1, 2);        // new 必填(JS 一致)
p.dist(new Point(4, 6));          // 5
```

### 7.2 语义(逐条对齐 JS,偏差仅一处且已标注)

- **`new C(args)`**:创建 null 原型对象 → 按声明序求值字段默认值写入自有键 → 复制方法引用为自有键 → 以 `this = 实例` 调用 `constructor` → 返回实例。无原型、无原型查找、无返回值覆盖
- **`constructor`**:可省略(默认空);体内**禁止带值 return**(裸 return 允许,提前结束)—— JS 的"constructor 返回对象会替换实例"是魔法,此处砍掉
- **`this`**:仅类成员体及其内嵌箭头合法(词法穿透箭头,与 JS 一致);**成员调用统一规则**(对一切对象生效,与 JS 一致):`o.f(args)`,f 为 function 声明/类方法 → `this` 绑定 `o`;f 为箭头 → 忽略接收者(词法 this)
- **方法提取**(JS 行为):`const d = p.dist; d(q);` → 提取后 `this` 为 undefined,体内 `this.x` → `access: 不能读取 undefined 的属性`(与 JS 严格模式的 TypeError 同款失败)
- **`new` 仅接受 class 值**:对普通函数/非函数使用 `new` → `type` 错(JS 允许 new 普通函数,此处砍);直接调用类名不带 new → 运行时错"类必须用 new 实例化"(JS 同款错误)
- **不做继承**:无 `extends`/`super`,复用用组合(字段持有另一实例)或普通函数
- **本轮同砍**:static 方法、getter/setter、`#` 私有字段、类表达式(`const P = class {}`)、`new C` 省略实参括号、参数解构
- **运行时类判别不可用**:`instanceof` 被砍、`constructor` 属性被屏蔽,判别实例的类只能靠自定义字段约定(如 `kind` 字段)—— 已知且接受的缺口

### 7.3 实例的数据语义

实例 = null 原型对象,自有键 = **字段 + 方法引用**(方法引用为共享的同一函数值):

- `typeOf(实例) === "object"`;`eq`/`copy`/`merge` 结构性照常工作(方法引用相同,`eq(p1, p2)` 只看字段值)
- **与 JS 的唯一行为偏差(标注)**:`keys(实例)` 含方法名(JS 的 `Object.keys` 不含原型上的方法)。原因:本语言无原型,方法存在自有键上。这是实现选择带来的透明偏差,文档明示

## 8. 标准库(18 项,宿主可增不可减)

| 内建 | 语义 |
|---|---|
| `Math` | 全量(纯函数) |
| `JSON.parse(s)` | 单参数;结果为 null 原型对象 |
| `JSON.stringify(x)` | 环 → `range` 错;function/undefined 值按 JS 规则(对象键省略、数组位变 null) |
| `parseInt(s)` | JS **部分解析**语义,恒十进制(`parseInt("42abc") === 42`) |
| `parseFloat(s)` | JS 语义 |
| `num(s)` | **整串**解析为 number,垃圾输入 → `NaN`。分工:宽松扫前缀用 parseInt,严格校验用 num |
| `str(x)` | number → JS 数字表示;boolean/null/undefined → 字面;string → 自身;array/object → JSON 文本;function → `"<function>"`;环 → `range` 错 |
| `isNaN` `isFinite` `NaN` `Infinity` `undefined` | JS 语义 |
| `typeOf(x)` | `"number" "string" "boolean" "null" "undefined" "array" "object" "function"`(class 值 → `"function"`、实例 → `"object"`,与 JS `typeof` 对齐并修复 null 错位、区分数组) |
| `keys(o)` | 仅接受 object;返回自有键数组,插入序(实例含方法名,见 7.3) |
| `eq(a, b)` | 深相等,**环安全**(图同构):`===` 先行(NaN 与 NaN 不等,与 `===` 一致);typeOf 不同 → false;array 逐元素、object 比键集(序无关)递归;function 按引用 |
| `copy(x)` | 深复制 array/object,**环安全且保留共享结构**;原始值原样返回;function 同引用;结果保持 null 原型 |
| `merge(a, b)` | **浅**合并:b 的键覆盖 a,产出新 null 原型对象,a/b 不动;仅接受两个 object |
| `fixed(x, n)` | number → 定长小数字符串,n ∈ [0,100] 整数;舍入语义与 JS `toFixed` 一致 |

## 9. 错误与异常

- **catch 到的语言错误是一个字符串**,格式 `"<错误类型>: <描述>"`,如 `"type: 运算符 / 要求 number,实际 string"`
- 错误类型固定六种:`syntax`(编译期)、`type`(运算符/条件/调用)、`range`(越界、下标、环引用)、`access`(属性策略)、`limit`(规模上限)、`host`(宿主异常跨界)
- **catch 无法做错误类型判别** —— 错误是数据字符串不是对象,这是刻意设计
- **你抛什么,捕什么**:用户 `throw` 的值经 catch 原样往返;仅语言自身与宿主来源的错误被字符串化
- 宿主异常**边界脱敏**:宿主函数抛进沙盒的任何异常,替换为 `"host: <仅 message>"`,`stack`/`cause` 永不跨界
- 运行时错误消息含运算符/属性名/实际类型等上下文,但**不含行号**;编译错误含行列号
- 深递归 → 引擎 `RangeError` 原样透传,不额外做深度计数

## 10. 程序模型与宿主契约(含边界隔离)

- 程序 = 函数体:顶层 `return` 合法;程序值 = return 值或最后一条表达式语句的值
- 宿主 API:`createRuntime(hostGlobals, opts)` / `compile(source, {globals})`
- 宿主全局**扁平命名**,注入即白名单,必须为合法标识符

**边界隔离(宿主无需自行隔离,沙盒定义即隔离)**:

| 跨界方向 | 规则 |
|---|---|
| 数据入(宿主全局里的对象/数组,含嵌套;宿主函数的返回值) | **深拷贝为 null 原型隔离快照**(环安全、共享保留,同 `copy()` 语义);每次执行开始重建快照,脚本对快照的写入**不回传宿主** |
| 函数入(宿主全局里的函数;数据对象里嵌的函数) | **按引用注入** —— 函数即能力,闭包仍持有宿主状态,调用即执行宿主代码 |
| 出(脚本传给宿主函数的实参;程序返回值) | 引用传递(沙盒自建对象为 null 原型,宿主持有无害);程序返回值是脚本向宿主输出数据的**唯一通道** |
| 宿主异常 | 字符串化 `"host: <仅 message>"`(第 9 节) |
| 回调入(框架日后调用脚本注册的函数,见 16.5) | 实参数据深拷贝快照入;返回值引用出;语言错误以字符串出 —— 双向同规 |

由此,**沙盒内可见的对象只有两种:null 原型数据(快照或脚本自建)与函数值** —— 宿主对象的原型面与原型污染(`__proto__` setter 特例)结构性不可达。快照拷贝会读取宿主对象的 getter(执行宿主代码),注入即宿主主动行为,此处注明。

- 同一编译产物多次执行:每次全新作用域 + 全新宿主快照;宿主与脚本的数据交换 = 快照(入)+ 返回值(出),**全局对象不再是共享通道**(确需共享状态时,宿主注入封装函数)
- 宿主函数必须同步;返回 Promise 则该值就停在 Promise(语言无异步消费手段)

## 11. 安全模型(五层,纯能力防护)

1. **编译期标识符白名单**(核心闸):每个标识符要么程序内声明,要么在白名单
2. **语法禁用总表**(见第 13 节)
3. **属性类型分派**:null 原型对象,原型链结构上不存在;function 接收者零属性,class 的 `prototype` 不可达
4. **运算符类型检查**:顺带消灭类型混淆探测
5. **宿主边界**:数据隔离(深拷贝 null 原型快照,函数按引用)+ 异常脱敏(仅 message 过界)

class 相关安全论证:`this` 只是接收者绑定,接收者本就是调用方持有的对象,无能力增益;`new` 只产出 null 原型实例,`new Function("…")` 不可达(`Function` 不在白名单,编译期即拒);方法提取后 `this` 为 undefined,只能访问 undefined 的属性(报错),无逃逸面。

**资源防护刻意不在语言范围内**(第 7 轮决策):内存耗尽(如 `"x".repeat(1e9)`)、死循环、同步阻塞均不设防 —— 语言只保证攻击者**出不去**(能力安全),不保证页面**不卡死**(可用性);处置方式由宿主环境决定(Worker + terminate、进程隔离,或接受)。深递归由引擎栈上限兜底(`RangeError` 透传)。编译器的编译期鲁棒性上限(第 12 节)保留 —— 那是防崩溃,不是防卡。

## 12. 规格级旋钮(语言规格的一部分,非实现细节)

| 旋钮 | 默认 | 说明 |
|---|---|---|
| `maxNesting` | 200 | 括号/方括号/块合计深度上限,防编译器自身栈溢出 |
| `maxSourceSize` | 1MB | 源码长度上限,宿主可调 |

两者超限均为 `limit` 错;不可信输入先过这关再谈解析。

## 13. 禁用总表(迁移视角)

读起来像 JS,但以下全部不存在:

**类型与转换**:`==`/`!=`、真值转换(`if (x)`)、`+` 混型、一元 `+`、`typeof` 运算符(用 `typeOf()`)、隐式 str/num 转换
**赋值与声明**:赋值作表达式、链式赋值、`var` 与变量提升、未初始化声明(类字段除外)、遮蔽/赋值白名单全局
**表达式**:逗号运算符、模板字符串、正则字面量、可选链、展开/剩余/解构
**对象**:getter/setter、computed 键、数字键、重复键、原型链与继承
**语句**:`switch`、`do-while`、`finally`、空语句、标签
**类**:`extends`/`super`、static、`#` 私有字段、类表达式、constructor 带值 return、new 普通函数
**运行时**:`this` 在类成员体之外、`delete`、`in`/for-in、`instanceof`、`import`/`export`/`require`、`async`/`await`/`yield`、`with`、`debugger`、`arguments`
**数组**:空洞、负下标、越界写、`length` 扩张

刻意保留的 JS 手感:缺键读得 `undefined`、除零得 `Infinity`、IEEE 精度行为、`sort` 就地修改、`arr.length` 收缩截断、`new`/`this`(限定在类的 JS 语义内)。

## 14. 保留字与演进

- `class` `new` `this` `constructor` 为现役(带第 7 节的限定);预留 `match` `record`(未来模式匹配/不可变记录)
- 演进规则:新增关键字 = 次版本号;语义只收紧不放宽;编译产物与语言版本号绑定

## 15. 行为样张(规格的可执行注释)

```
// 评分统计
let scores = [72, 91, 55, 84, 68];
let total = 0;
for (const s of scores) { total += s; }
let mean = total / scores.length;

class Grader {
  cutoff = 60;
  constructor(cutoff) { this.cutoff = cutoff; }
  grade(m) {
    if (m >= this.cutoff) { return "及格"; }
    return "不及格";
  }
}

let g = new Grader(60);
print("平均 " + fixed(mean, 1) + "," + g.grade(mean));
print(g.grade(59));

// 反例(全部报错):
// "平均 " + mean     → type: 运算符 + 要求同型
// if (scores)        → type: 条件须为 boolean
// let x;             → syntax: 必须初始化
// 1 == "1"           → syntax: 禁止 ==
// if (x = 1)         → syntax: 赋值不是表达式
// function f() { return this; }   → syntax: this 仅类成员体内合法
// class B extends A {}            → syntax: 不做继承
// copy(自引用对象)    → ✓ 环安全
// eq(g, copy(g))     → true
```

## 16. 宿主框架与渲染边界(规范性附录)

适用场景:webos 中以 AetherJS 脚本驱动 MV 框架与**伪 SSR**(客户端模拟后端渲染)。本节与五层安全模型同级,是规格的一部分;约束对象是**宿主框架**,不是脚本作者。

### 16.1 总原则

1. **模板是程序,不是字符串**:模板必须经框架编译器解析为 IR(节点树)后才可使用,白名单产生式,解析不了即编译错
2. **数据是数据**:渲染 = IR + 类型化槽填充,不做字符串拼接;值只能进"槽",槽填不出新结构
3. **事后独立复检**:产物用浏览器自己的解析器验证;页面级 CSP 兜底
4. **伪后端不是信任边界**:它只是前端代码的组织形态 —— 凡伪后端"知道"的(配置、假 session、密钥),脚本与用户最终都能知道;真密钥、真鉴权只存在于真后端

### 16.2 模板编译期安全

- **白名单标签**:`div span p h1-h6 ul ol li table thead tbody tr td th b i em strong br a img`;白名单由单一事实来源定义,宿主可裁剪,扩充即承担重新审计责任
- **白名单属性**:`class id title ref` 与 `data-*` 及少数语义属性;**一切 `on*` 属性在文法中不存在**(不是检测后删,是产生式不接受);`script style link meta iframe object embed base form` 同理不存在
- **文法严于 HTML**:属性引号强制、标签必须闭合、无注释、无 DOCTYPE、无 raw text 模式 —— 文法是 HTML 的严格子集,凡通过者语义唯一,解析器差异类攻击(mXSS)无落点
- **插值表达式复用 AetherJS 编译器**:`{{user.name + "!"}}` 按 AetherJS 严格表达式编译,白名单标识符、严格类型、无 eval 全部适用
- **模板逻辑最小化**:仅 `each`/`if` 微逻辑;复杂逻辑在脚本中组装数据后传入
- **无 raw 插值通道**:不提供 `{{{raw}}}`/v-html 类原样插值;富文本需求经 `rich(text)` 能力递归过同一编译器
- **编译限额**:模板大小与嵌套深度上限(同 `maxNesting` 思路),超限编译错

### 16.3 渲染期安全(类型化槽)

| 槽类型 | 规则 |
|---|---|
| 文本槽 | 转义 `<` `&`(文本节点内即可) |
| 属性值槽 | 转义引号/`&` + 属性级约束 |
| `href`/`src` 槽 | **校验而非转义**:结果必须为相对路径;`http:` `https:` `javascript:` `data:` `//` 开头一律拒绝(禁外部任何资源条文的落点,同时消灭外传通道)。校验在**浏览器规范化后的形态**上判定(首尾空白剔除、`\t\n\r` 移除、`\` 当 `/`)且对**整条拼接值**进行 —— 多段插值拼不出 scheme,空白/控制字符/反斜杠不可绕过;校验后再做属性转义,值含引号也越不出属性 |
| `style` | 无字符串槽;样式在 IR 中为属性级节点(如 `color: <值槽>`),值按属性白名单文法校验,拼 CSS 字符串的路径不存在 |

挂载走 IR → DOM API(`createElement`/`setAttribute`),`innerHTML` 全管线不出现;`html()` 字符串导出仅供日志/预览,不参与挂载。

### 16.4 事后检测(三层)

1. **挂载前 · DOMParser 独立复检**:凡架构中仍产出 HTML 字符串的环节(如仿真 SSR 响应),必须先过 `new DOMParser().parseFromString(s, 'text/html')` —— 惰性文档,脚本不执行、资源不加载,验证环境自身安全;随后遍历断言白名单(标签、属性、URL 全相对、零 `on*`),违规拒绝渲染。验证用解析器 = 消费用解析器,mXSS 整类作废;复检产物即挂载源(adopt 节点),`innerHTML` 依旧不需要
2. **挂载后 · MutationObserver 盯挂载根**:后续 DOM 变更引入越权节点/属性即告警回滚 —— 防的是宿主自身 bug(脚本本就摸不到 DOM),纵深防御
3. **页面级 · CSP 兜底**:`script-src 'self' blob:`(无 `unsafe-inline`、无 `unsafe-eval`;`blob:` 是运行时编译产物的加载通道,浏览器内部地址、零网络请求,见 B.2)、`object-src 'none'`、`base-uri 'none'`、img/style 按需收紧;以上全层失手时,内联脚本不执行、外联资源发不出。CSP 不覆盖视觉伪装(画假系统 UI),那归 webos 窗口信任模型

验证器与渲染器必须共用同一份白名单常量(单一事实来源),并维护已知 XSS payload 对抗用例库做回归。

### 16.5 框架数据流与回调跨界

- **推荐架构:脚本无状态**。状态宿主持有;事件分发 = 事件数据快照入 + 渲染/处理函数返回视图树(或新状态)出 —— 照抄真 SSR 的形状,第 10 节边界模型原封不动,只是"执行一次"变"执行多次"。双向绑定若确需,共享状态也必须是宿主侧 null 原型对象 + 注入的读写函数,每条新跨界都成文入册
- **回调跨界规则**(已补入第 10 节表格):宿主调用沙盒函数 = 实参快照入、返回值出、语言错误字符串出
- **能力注入分级**:`render`(挂载点限定)、`store`(限本应用 appdata)、`net`(URL 白名单);注入即授权,每个能力是宿主独立的信任决策
- **渲染循环**(响应式环)与资源耗尽同属第 7 轮出域方针,语言不设防,宿主自备处置
- **视觉伪装**(脚本画假 webos 界面骗输入)是内容信任问题,归窗口信任模型,不在本边界职责内

### 16.6 DOM 控制通道(能力句柄 + 窄命令集)

允许脚本命令式操作 DOM,但**摸不到真实节点** —— 只持有宿主铸造的不透明句柄:

- **refs 铸造**:模板元素声明 `ref="hp"`(属性白名单成员,宿主机制、不落 DOM);宿主 `mountTree(树)` 验树、物化(createElement/textContent,`innerHTML` 全程不存在)并铸造句柄表;程序契约为 `return (refs) => { … }` —— init 函数作为程序返回值交给宿主调用
- **句柄即能力**:以函数值形态跨界(天然按引用传递);不可调用(调用即 `type` 错)、不可伪造;解析时校验"仍连接且在本挂载根内",失效句柄一律 `access` 拒绝 —— 单元素能力,越界结构上不可能
- **命令集**(值的校验与 16.2/16.3 同一来源,无第二套规则):`ui.text(h, s)`(textContent)、`ui.attr(h, k, v)`(属性白名单 + href/src 相对路径)、`ui.style(h, prop, v)`(属性级白名单 + 字符集,值禁 `url(`)、`ui.cls(h, add|remove|toggle, token)`(token 限 `[A-Za-z0-9_-]+`)、`ui.show/hide(h)`、`ui.append(h, 树)`(见下)、`ui.remove(h)`、`ui.on(h, 事件类型, 回调)`(事件类型白名单:click/dblclick/keydown/keyup/mouseenter/mouseleave/input/change)
- **事件回调跨界**:回调收到**数据快照** `{type, key, x, y, altKey, ctrlKey}`,裸 Event 不跨界;回调内的语言错误以 AetherError 交宿主(`onScriptError`),不裸抛
- **验树(本节唯一新增防线)**:`ui.append` 的树是数据、脚本可手搓 —— 物化前必须全量过白名单校验(标签/属性/style/URL/class token,与模板 IR 同一套校验器)
- **禁用清单**:`innerHTML`/`insertAdjacentHTML` 任何形态、裸节点与裸事件对象跨界、挂载根之外的操作、`createElement` 类工厂直通、命令返回 DOM 值
- **执行线程(第 17 轮定案)**:页面动态脚本在**主线程同步执行,不进 Worker** —— 同步 DOM 能力过线程界只有两条路(命令队列异步化改时序语义,或 SAB 阻塞 RPC),均不值;渲染环/死循环导致的页面卡死**归作者责任**(第 7 轮资源防护出域方针在交互场景的延续)。Worker 备用路线仅保留给伪 SSR/路由线(纯函数边界,天然可迁移,需要时另行实施,见 B.2)

### 16.7 伪后端路由(Django 风格,纯数据路由表)

程序契约:`router.ajs` 的 return **只有路由表** —— 纯数据、全字符串、英文全拼字段,不含任何函数与模板定义;处理函数独立成 `.ajs` 文件(其程序返回值即函数),模板独立成 `.html` 文件或内联串。

**字段(七条)**:

| 字段 | 规则 |
|---|---|
| `domain` | **必填**;域名或 IP 形式均可(`mygame.os`、`127.0.0.1`) |
| `subdomain` | 省略 = 没有;匹配采用通用后缀规则:主机等于 `domain`、或以 `.domain` 结尾(多出的前缀必须与 `subdomain` 相等)—— 域名与 IP 无需分别处理;`subdomain: "*"` = 任意**单级**前缀(多级前缀与裸域不命中;裸域只属于省略 subdomain 的条目;具体子域条目应排在通配之前) |
| `port` | 省略 = 默认端口(URL 不写端口或写 `:80`);写了必须精确相等 |
| `path` | 必填;`<名字>` 提取文字参数、`<number:名字>` 提取数字参数(不匹配则整条不命中);**末段 `*` = 前缀认领子树**(`/wiki/*` 匹配 `/wiki`、`/wiki/a/b` 等全部,段对齐、不捕获余段;仅允许末段,`/*` 不合法);`path: "*"` 仅可作某域名下最后一条,是该域名的**兜底页(作者自定义 404)**;通配与具体规则并存时,更具体的应排在通配之前(顺序即优先级,作者保证) |
| `script` | 省略 = 纯 HTML 模式,直接渲染模板(无数据);写 = `.ajs` 文件名字符串或函数名字符串(解析规则:同名 `.ajs` 文件) |
| `template` | 文件名(以 `.html` 结尾)或内联模板源码串;列表则由函数返回 `template: 第几个` 选择 |
| `condition` | 省略 = 无条件;值为 **AetherJS 严格表达式串**(编译管线同模板插值,规格 16.2):裸标识符一律解析为 `progress` 的键(仅 `undefined`/`NaN`/`Infinity` 保留字面),禁函数调用/new/赋值等一切副作用语法(纯数据谓词);挂载期编译校验,分发期求值结果必须是 boolean —— **非 boolean 或求值错(含混型比较的 type 错)一律视为不成立并记 dev 日志,不做隐式转换** |

**处理函数契约**:独立 `.ajs` 文件,程序返回值即函数,签名 `(args, progress)`:

- `args`:URL 传参 —— 路径参数与 `?` 查询串参数合并为一个对象;值的类型由 pattern 决定(`<名字>` 文字、`<number:名字>` 数字)
- `progress`:进度快照(store 深拷贝,第 10 节边界原样;**渲染只读**,写回能力未来以注入方式提供)
- 返回 `{ template: 索引, data: 数据 }`

**平台职责(匹配 + 三条简单校验 + 兜底)**:

1. 挂载校验:路由表字段齐全、pattern 语法合法、`script` 引用的文件存在且返回函数、`template`(文件与内联串同规)全部过白名单编译、`condition` 表达式编译通过(禁用语法在此暴露)
2. 分发:**按序匹配,路由表顺序即优先级,先匹配先生效** —— domain 后缀规则 + subdomain + port + path 全过后才求值 `condition`;**URL 命中而条件不成立 → 继续向下扫描**(叠层路由:同路径多条、条件由严到宽);条件求值错视为不成立并记日志。命中后载入 script → 调用 → 按返回索引取模板 → 渲染
3. 兜底:未命中(且无 `path: "*"` 条目)、函数抛错、返回不合法(索引越界等)→ 平台默认 404 页;错误信息用第 9 节的错误串格式

平台侧没有任何路由逻辑可被攻击 —— 路由决策的输入是宿主解析的 URL 与挂载时已校验的静态表,函数的返回值被限定在模板列表索引内。一级域名 → 应用的归属仍由 webos 安装清单决定。dev 模式提供 console 面板,`print` 输出与错误串均可见(作者调试出口)。

**样例(已过编译器与分发验证)**:

```
// router.ajs
return [
  { domain: "mygame.os", path: "/", template: "home.html" },
  { domain: "mygame.os", path: "/level/<level>/", script: "quest", template: ["quest.html", "locked.html"] },
  { domain: "mygame.os", path: "/ending/", condition: "score > 9", template: "ending-gold.html" },
  { domain: "mygame.os", path: "/ending/", template: "ending-normal.html" },
  { domain: "mygame.os", path: "/docs/api/", template: "api.html" },
  { domain: "mygame.os", path: "/docs/*", script: "docs", template: "docs.html" },      // 末段 * 认领子树(具体条目排前面)
  { domain: "mygame.os", subdomain: "*", path: "/", template: "tenant.html" },           // 任意单级子域
  { domain: "mygame.os", subdomain: "wiki", path: "/", template: "wiki.html" },          // 具体子域,排在通配之前
  { domain: "mygame.os", port: 8080, path: "/", script: "admin", template: "admin.html" },
  { domain: "mygame.os", path: "*", template: "my404.html" },
  { domain: "127.0.0.1", path: "/", template: "local.html" },
];

// quest.ajs —— 处理函数文件
return (args, progress) => {
  if (progress.chapter < 3) {
    return { template: 1, data: { required: 3 } };      // 按进度选第 2 个模板
  }
  return { template: 0, data: { level: args.level, tab: args.tab } };
};
```

分发实测:`mygame.os/level/q2/` @2章 → `locked.html`;@5章 → `quest.html`(data 带 `level`/`tab`);`wiki.mygame.os/` → 子域条目;`mygame.os:8080/` → 端口条目,`mygame.os:9999/` → 兜底;`127.0.0.1/` → IP 主域名条目。`/ending/` @score=12 → `ending-gold.html`(条件成立);@score=5 → 条件不成立落向下一条 → `ending-normal.html`;@score 为字符串 `"12"` → 混型 type 错 → 视为不成立 + dev 日志,同落 `ending-normal.html`。


## 附录 A:迭代决策记录

| 轮次 | 决策 |
|---|---|
| 1 | 全严格运算符;读取宽松保 undefined;`++` 保留,其余激进砍(finally/do-while/switch/逗号/一元 +/var/typeof) |
| 2 | 赋值仅作语句;let/const 必须初始化;禁止遮蔽白名单全局;数组无空洞写入规则;空语句砍掉;常量折叠忠实性;编译器健壮性入规格 |
| 3 | 错误值字符串化 `"<类型>: <描述>"`,catch 无类型判别,用户 throw 原样往返;标准库 18 项(追加 eq/copy/merge/fixed);for-of 按 UTF-16 码元;宿主全局扁平命名;执行隔离模型;规格级旋钮;中文错误消息 |
| 4 | copy/eq 环安全(共享保留、图同构);str/stringify 遇环 `range` 错 |
| 5 | **确立子集原则**(保留即 JS 一致,不一致只能砍不能改);添加 class:JS 语法与语义(`new` 必填、`constructor`、隐式 `this` 仅限类成员体、方法提取行为同 JS 严格模式)、无继承/static/getter/私有字段、实例为 null 原型对象(方法存自有键,`keys()` 含方法名为唯一标注偏差)、new 仅类、constructor 禁带值 return |
| 6 | **宿主边界隔离**(取代"提醒宿主自行隔离"的弱方案):数据入界深拷贝为 null 原型快照(每次执行重建、写入不回传)、函数按引用注入、程序返回值为唯一数据出口、宿主异常字符串化;沙盒内不再存在带原型的宿主数据对象,`__proto__` setter 特例结构性消失;标注内存无配额缺口(`maxAlloc` 待定) |
| 7 | **资源防护整体出域**:内存/时间/循环一律不设防("内存和时间都不用管"),移除循环配额层与 `loopBudget` 旋钮,安全模型收敛为纯能力的五层;`maxAlloc` 不引入;语言只保证攻击者出不去,不保证页面不卡死,可用性归宿主环境 |
| 8 | **模板与渲染边界入规格**(第 16 节):模板按程序编译(白名单文法 → IR,文法严于 HTML)、渲染按类型化槽(href/src 校验非转义、禁外部资源即禁外传通道)、事后三层检测(DOMParser 独立复检、MutationObserver、CSP 兜底);回调跨界规则补入第 10 节;推荐脚本无状态架构;伪后端明示非信任边界 |
| 9 | **实现方案调研入附录 B**(非规范性,不含任何实施承诺);重要发现:16.4 的 CSP 兜底与运行时 `new Function` 存在张力,候选解法已列,实施前需验证 |
| 10 | **执行机制定案:blob 模块**(B.2):编译产物包为 ES 模块经 Blob URL 动态 `import()` 加载,编译异步、执行同步;CSP 放行 `blob:`、不开 `unsafe-eval`,与 16.4 兜底共存(16.4 的 CSP 行相应补 `blob:`)。场景定位:游戏作者网页工具,事件级渲染频率使 Worker 克隆往返不划算,Worker 降为备用;nonce 判定不采用(静态 CSP 死结 + DOM 外泄/不记名通行证等风险,记录为服务端场景可用) |
| 11 | **实现落地 + 文法勘误**:let 初始化值、三元分支、数组/对象元素由 Assign 更正为 Expr(与脚注 ¹"赋值仅语句位与 for 头"一致,消除文法与脚注的自相矛盾);构造顺序勘误确认:字段 → 方法(不含 constructor)→ constructor 赋值,故 keys(实例) 序为"声明字段、方法、构造器赋值键"。实现:110 例测试全绿,样例与编译产物落 examples/compiled |
| 12 | **DOM 控制通道入规格(16.6)与实现**:能力句柄(ref 属性 + mountTree 铸造,函数值跨界、单元素能力、失效即拒)、窄命令集 ui.*(值校验与模板同一来源)、事件数据快照跨界、append 前验树(手搓树是预期攻击面)、`return (refs) => {}` 程序契约。实现中发现并修复:style 值字符集曾放行 `url(`(补禁令,封外传通道);箭头试探回退吞掉体内真错(补 sawArrow 守卫);命令名 `class` 撞关键字更名 `ui.cls`(属性名仍不接受关键字,子集原则不变)。测试 120 例全绿 |
| 13 | **伪后端路由定稿(16.7)**:Django 风格纯数据路由表 —— `domain` 必填(域名/IP 均可)、`subdomain` 通配后缀规则、`port` 精确匹配(省略=默认端口)、`path` 参数(`<名字>`/`<number:名字>`)与 `path: "*"` 兜底(作者自定义 404)、`script` 省略即纯 HTML 页、`template` 文件名或内联串(列表由函数选索引);处理函数独立文件,直收 `(args, progress)`,渲染只读; 命名原则:英文全拼、不用缩写、不用上下文对象(面向不懂编程的作者)。平台仅匹配 + 三条挂载校验 + 兜底,无路由逻辑可攻击; 进度写回与跳转不做,需要时以能力注入方式引入。样例经编译器与分发验证 |
| 14 | **路由实现落地(16.7)+ `condition` 进度条件**:平台侧 `src/router.js`(挂载校验/按序分发/参数路径/兜底 404,处理函数收 progress 深拷贝快照);`condition` 复用语言编译器 —— 裸标识符经 AST 改写解析为 `progress` 的键、禁函数调用等一切副作用语法(纯数据谓词)、挂载期编译校验、产物形态同 B.2;**求值错与非 boolean(含混型比较的 type 错)一律视为不成立并记 dev 日志,不做隐式转换**;路由表顺序即优先级,URL 命中而条件不成立继续向下匹配(叠层路由)。测试 140 例全绿 |
| 15 | **路由通配**:path 末段 `*` = 前缀认领子树(段对齐、不捕获余段;仅允许末段,`/*` 与中段 `*` 挂载拒绝;整域兜底仍是 `path: "*"` 且须作同域最后一条);`subdomain: "*"` = 任意单级前缀(多级前缀与裸域不命中)。两者均不捕获命中内容、均按序优先,更具体的规则排在通配之前由作者保证 —— 平台侧依旧零匹配逻辑可攻击。测试 145 例全绿 |
| 16 | **安全审查修复(URL 槽四面加固)**:① 判定改在浏览器规范化后的形态上(前导空白 `" javascript:x"`、内嵌控制字符 `"java\nscript:x"`、反斜杠 `"\/evil.com"` 此前可绕过,Node 服务路径无 DOMParser 复检时真实可达);② href/src 改**整条拼接值**统一校验(此前逐段校验,`{{段}}:静态段` 可拼出 scheme);③ 校验后补属性转义(此前值含 `"` 可在 html 字符串导出路径越出属性引号);④ 纯静态 href/src 编译期即拒;checkUrlValue/urlSlot 归一为单一来源,checkHtml 复检同步规范化。serve.mjs 装载器加目录围栏。测试 149 例全绿 + 真实 HTTP 攻击模拟(属性注入 payload 被转义为惰性文本) |
| 17 | **DOM 通道脚本定案主线程**:页面动态脚本(16.6)不进 Worker —— 同步 DOM 能力过线程界要么命令队列异步化(改时序语义)要么 SAB 阻塞 RPC(要 COOP/COEP + 绑死主线程),均不值;页面卡死归作者责任(第 7 轮出域方针的延续,处置权在宿主:接受或不上架)。Worker 备用路线收窄为仅面向伪 SSR/路由线(处理器是纯函数、快照边界天然可迁移,若实施为 Worker RPC 壳 + terminate 兜底);时间控制/停止信号若引入,采用"宿主注入同步 tick + 不可被脚本 catch 的中止哨兵"形态,不做 async(语言无异步是定案,插桩不得从后门引入) |
| 18 | **后端执行进 Worker(落地)**:`src/worker-core.js`(共享核心)+ 双环境薄壳 `worker-boot.mjs`(浏览器,self 判据)/ `worker-boot-node.mjs`(node: 静态导入)—— 宿主侧 `src/worker-host.js` 的 `createWorkerBackend()`。消息协议即第 10 节边界的线程版:args/progress 结构化克隆入、返回值克隆出(函数不过界,返回值含函数即报错)、语言错误以 {kind, message} 形状回传、print 单向消息转发(无返回值能力天然可异步化)。挂载校验由 Worker 侧 `load` 承担(编译 + 验证程序返回函数);超时(默认 5s,`SCRIPT_TIMEOUT_MS` 可调)→ terminate 强制终止 + 惰性重生;terminate 后迟到事件按实例隔离不误杀重生 Worker。路由器新增 `runScript` 执行器选项(提供时处理函数走 Worker,否则内联执行不变);条件表达式与模板渲染留主线程(条件是单表达式无循环、天然有界)。页面动态脚本维持第 17 轮定案。**实现约束(浏览器实测):Worker 入口不得使用顶层 await —— 模块求值挂起期间到达的消息会被丢弃,薄壳必须在同步求值内完成消息注册**。Node(worker_threads)153 例全绿 + 真实 HTTP 死循环拦截实测;浏览器(module Worker)五项实测通过(执行/克隆快照/错误形状/超时强杀/重生/print 转发) |

## 附录 B:实现方案调研(非规范性,不含实施承诺)

> 本附录只回答"若实施,路线怎么选",不构成计划、不含代码。所有结论为纸面研判。

### B.1 语言编译器

| 路线 | 研判 |
|---|---|
| **手写词法 + 递归下降解析**(倾向) | 本文法无 ASI、无模板串、无正则歧义、无一元 `+`,比完整 JS 简单一个量级;零依赖、错误消息完全可控、生成物可审阅。v0.1 原型已趟过优先级爬升与箭头回溯的坑 |
| 解析器生成器(Peggy/nearley/chevrotain) | 文法即文档,但引入依赖、错误消息控制弱、生成代码不可审阅 —— 与零依赖哲学冲突 |
| 复用完整 JS 解析器(acorn)后裁剪 AST | 开发快,但安全逻辑变成对完整 JS 节点类型的**黑名单裁剪**,漏一种节点即漏洞 —— 与白名单哲学相反,排除 |

代码生成:AST → 可读 JS(带缩进,满足"生成物可审阅"承诺)→ `new Function('AETHER', …)`。树遍历解释器(JS-Interpreter 一类)慢约百倍,排除;quickjs-emscripten 约 600KB 且给的是完整 JS,对子集语言没有必要,排除。严格类型运算符经 `$add`/`$lt` 等帮助函数调用,字面量做常量折叠抵消。

### B.2 运行时与 CSP 的张力(已定解法:blob 模块)

**16.4 第 3 层的 CSP 兜底(`script-src 'self'`,无 `unsafe-eval`)会直接禁掉 `new Function`** —— 渲染防线的最外层与语言执行机制互相矛盾。曾列四候选,现已定案:

**定案:候选 2(blob 模块)为主案。** 执行机制为:

- 编译产物包为 ES 模块(`export default function (AETHER) { … }`,模块自动严格模式、独立作用域,与语言约束天然合拍)
- `Blob → createObjectURL → 动态 import()` 取得导出函数,之后**同步调用**执行;用毕 `revokeObjectURL` 作废地址
- CSP 设 `script-src 'self' blob:` —— `blob:` 是浏览器内部地址,**零网络请求**,不违反"禁外部资源";通行证(不可猜测的 blob 地址)由持有受验证编译产物的运行时**垄断铸造**,沙盒代码无 `URL`/`Blob` 能力,markup 注入拿不到地址
- **代价(唯一实付)**:编译变异步(`import()` 返回 Promise),执行仍同步;编译可缓存,异步每程序只发生一次

**选 blob 而非 Worker 的场景论据**:宿主定位为游戏作者的网页制作工具,伪 SSR 架构下每次事件都要过一遍渲染管线(事件快照入 → 视图树出)——运行时若在 Worker,每次渲染都是一次结构化克隆往返,交互频率下不划算;blob 主线程直达。Worker 降为备用:未来真正敌意内容的场景再启用。**第 17/18 轮落地分工**:页面动态脚本(16.6)定案主线程不进 Worker(卡死归作者);伪 SSR/路由处理器已 Worker 化(`src/worker-host.js`,worker_threads / module Worker 双环境,超时 terminate,克隆往返成本由低频页面请求吸收)。

**nonce 判定:不采用。** 死结:随机 nonce 进不了静态 CSP(静态页无法预知每次加载的随机值;固定 nonce 即公开,查看源代码可见)。风险账(若采用):DOM 外泄(依赖浏览器 nonce 隐藏缓解,实现有版本差异)、不记名通行证只认证通道不认证内容(可信代码把受控内容包进带 nonce 的 script 即 RCE)、`strict-dynamic` 信任放大。记录为"服务端渲染场景可用,静态站不适用"。

候选 1(`unsafe-eval`,兜底报废)与候选 4(AST 解释器,慢约百倍)维持排除。

**实施前仍需最小原型验证**:`import(blob:)` 在目标浏览器的 CSP 行为一致性、blob URL 的生命周期与内存管理。结论回写本附录。

### B.3 模板引擎

- **自研小解析器**(倾向):文法极小(标签/属性/文本/插值/`each`/`if`),状态机或递归下降即可,规模远小于语言解析器。Mustache 家族已证明"微逻辑模板"的文法可以做到极小且无歧义
- **借鉴 lit-html 的安全模型**:其 tagged template 将静态骨架固定、动态值只落槽位 —— 与第 16 节"IR + 类型化槽"完全同构,可作为槽位更新(TemplateInstance 复用)的性能参照;webos 应用规模下,起步用"全量重渲染 + keyed diff"已足
- 现成引擎(Pug/EJS/Handlebars)均带 raw/unsafe 通道或要求完整 JS 表达式,与规格冲突,排除
- 16.4 第 1 层的 DOMParser 复检:自研约百行(遍历断言白名单),或采用 DOMPurify 严配置作现成候选(成熟、对抗用例库公开)—— 两者取一,验证器与渲染器共用同一份白名单常量的要求不变

### B.4 框架数据流

16.5 的"脚本无状态、事件快照入、视图树出"与 **Elm 架构(MVU)** 完全同构,可参照其 update 消息协议设计宿主侧状态机;响应式双向绑定若引入,共享对象走宿主侧 null 原型 + 注入读写函数,每条新跨界成文入册的规矩不变。

### B.5 规模感(仅数量级,非估算承诺)

编译器(词法/解析/校验/生成)约 2~3 千行;运行时(边界隔离 + 内建 18 项)约 1 千行内;模板引擎约 1 千行内;框架分发层约 1 千行内。均以零依赖纯 JS 计。
