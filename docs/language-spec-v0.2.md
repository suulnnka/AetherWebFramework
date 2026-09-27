# AetherJS v0.2 语言设计规格(定稿)

> **状态**:设计定稿,**未实施**。仓库中现有代码为 v0.1 实现,与本规格不一致;本规格是对 v0.1 的反魔法重设计,是否实施、何时实施另议。
> **定稿时间**:2026-09-28,经五轮迭代收敛。
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
LetDecl  → ("let"|"const") ID "=" Assign ("," ID "=" Assign)* ";"    // 必须初始化
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
Ternary → Or ("?" Assign ":" Ternary)?          // test 须 boolean
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
ArrayLit → "[" (Assign ("," Assign)* ","?)? "]"
ObjectLit → "{" ((ID|STR) ":" Assign ("," …)* ","?)? "}"
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
- 错误类型固定六种:`syntax`(编译期)、`type`(运算符/条件/调用)、`range`(越界、下标、环引用)、`access`(属性策略)、`limit`(循环配额、规模上限)、`host`(宿主异常跨界)
- **catch 无法做错误类型判别** —— 错误是数据字符串不是对象,这是刻意设计
- **你抛什么,捕什么**:用户 `throw` 的值经 catch 原样往返;仅语言自身与宿主来源的错误被字符串化
- 宿主异常**边界脱敏**:宿主函数抛进沙盒的任何异常,替换为 `"host: <仅 message>"`,`stack`/`cause` 永不跨界
- 运行时错误消息含运算符/属性名/实际类型等上下文,但**不含行号**;编译错误含行列号
- 深递归 → 引擎 `RangeError` 原样透传,不额外做深度计数

## 10. 程序模型与宿主契约

- 程序 = 函数体:顶层 `return` 合法;程序值 = return 值或最后一条表达式语句的值
- 宿主 API:`createRuntime(hostGlobals, opts)` / `compile(source, {globals})`
- 宿主全局**扁平命名**,注入即白名单,必须为合法标识符
- 同一编译产物多次执行:每次全新作用域;宿主全局对象**同引用共享**(沙盒可写宿主对象 —— 宿主文档必须显著标注)
- 宿主函数必须同步;返回 Promise 则该值就停在 Promise(语言无异步消费手段)

## 11. 安全模型(六层)

1. **编译期标识符白名单**(核心闸):每个标识符要么程序内声明,要么在白名单
2. **语法禁用总表**(见第 13 节)
3. **属性类型分派**:null 原型对象,原型链结构上不存在;function 接收者零属性,class 的 `prototype` 不可达
4. **运算符类型检查**:顺带消灭类型混淆探测
5. **循环配额 `$tick`**:默认 5000 万步,每次执行可调、可关
6. **宿主边界脱敏**:异常仅 message 过界

class 相关安全论证:`this` 只是接收者绑定,接收者本就是调用方持有的对象,无能力增益;`new` 只产出 null 原型实例,`new Function("…")` 不可达(`Function` 不在白名单,编译期即拒);方法提取后 `this` 为 undefined,只能访问 undefined 的属性(报错),无逃逸面。

已知边界(诚实清单):同步阻塞;`try { while (true) {} } catch` 吞配额异常可绕过配额(对抗完全恶意代码请宿主用 Worker + terminate);编译器自身受第 12 节旋钮保护。

## 12. 规格级旋钮(语言规格的一部分,非实现细节)

| 旋钮 | 默认 | 说明 |
|---|---|---|
| `maxNesting` | 200 | 括号/方括号/块合计深度上限,防编译器自身栈溢出 |
| `maxSourceSize` | 1MB | 源码长度上限,宿主可调 |
| `loopBudget` | 5×10⁷ | 循环总步数,每次执行可调,可关 |

三者超限均为 `limit` 错;不可信输入先过这关再谈执行。

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

## 附录:迭代决策记录

| 轮次 | 决策 |
|---|---|
| 1 | 全严格运算符;读取宽松保 undefined;`++` 保留,其余激进砍(finally/do-while/switch/逗号/一元 +/var/typeof) |
| 2 | 赋值仅作语句;let/const 必须初始化;禁止遮蔽白名单全局;数组无空洞写入规则;空语句砍掉;常量折叠忠实性;编译器健壮性入规格 |
| 3 | 错误值字符串化 `"<类型>: <描述>"`,catch 无类型判别,用户 throw 原样往返;标准库 18 项(追加 eq/copy/merge/fixed);for-of 按 UTF-16 码元;宿主全局扁平命名;执行隔离模型;规格级旋钮;中文错误消息 |
| 4 | copy/eq 环安全(共享保留、图同构);str/stringify 遇环 `range` 错 |
| 5 | **确立子集原则**(保留即 JS 一致,不一致只能砍不能改);添加 class:JS 语法与语义(`new` 必填、`constructor`、隐式 `this` 仅限类成员体、方法提取行为同 JS 严格模式)、无继承/static/getter/私有字段、实例为 null 原型对象(方法存自有键,`keys()` 含方法名为唯一标注偏差)、new 仅类、constructor 禁带值 return |
