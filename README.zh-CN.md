# sessionFlow for DeepSeek Harness

**Cross-agent session continuity for DeepSeek Harness.**

在 DeepSeek Harness 里直接继续你在 Codex、Claude Code、Grok、ZCode 等编码 Agent 中做的工作。

不是"又一个 session 管理器"，而是把 sessionFlow 的接续层以六个 tool 的形式提供给 DSH。

```
用户：  继续我之前在 Claude Code 里对这个仓库做的工作。

DSH：  → sessionflow_current_work
       → sessionflow_continue

       [接着之前的目标、文件、命令和未完成的任务继续]
```

```
Claude Code ─┐
Codex ───────┤
Grok ────────┤
ZCode ───────┼─ sessionFlow ─ DSH
DSH ─────────┤
Cursor ──────┤
Kiro ────────┘
```

---

## 这是什么

一个薄的 DSH 插件，把 [sessionFlow](https://github.com/HarryHeYu/sessionFlow)
（Voyager）暴露为六个 tool。sessionFlow 会索引你机器上所有编码 Agent 的会话历史；
本插件让 DSH Agent 能用上这段历史——找到过去的工作、看清当前项目做到哪了、并接着做。

**核心始终是唯一事实来源。** 会话解析、索引、搜索、WorkThread、排序、合并、上下文编译
全部不在这里发生：每次调用都通过核心稳定的 JSON 接口转发给已有的 Voyager core。

## 前置要求

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）
  —— 实测版本 **0.1.5-rc.3**，且**模型 provider 必须可用**。全新的 `headless`
  profile 既没有 LLM adapter 也没有凭证，DSH 会直接停下并报
  `MISSING_CREDENTIAL: … no API key for provider route`。那属于**宿主的配置**，
  不是本插件的问题：**本插件不提供模型访问能力**，也无法绕过一个缺失的 provider。
  请先把 provider 配好，再装这里的东西。
- [sessionFlow / Voyager](https://github.com/HarryHeYu/sessionFlow)，
  **从源码安装**并建好索引。它**没有发布到 PyPI** —— PyPI 上的 `voyager`
  是一个毫不相干的最近邻搜索库，`pip install voyager` 会装错项目。
- Node.js **22.19+**

也就是说这里有**两个彼此独立**的依赖：DSH 需要模型 provider 才能运行，本插件需要
sessionFlow core 才能回答任何问题。本插件不会引入第三个。

## 安装

两部分都从各自的 Git 仓库安装。它们都没有发布到 PyPI 或 npm，
所以今天**没有**能用的 `pipx install` / `dsh plugin add <包名>` 一行命令。

```sh
# 1. 核心，从源码装
git clone https://github.com/HarryHeYu/sessionFlow
cd sessionFlow
pip install -e .
voyager scan

# 2. 本插件，直接从 GitHub 装
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
dsh --profile web
```

pnpm 默认**不允许** git 来源的包执行构建脚本，所以第一次 `add` 会停下并打印
它需要的那个 key。把该 key 写进 profile 的 `pnpm-workspace.yaml`，再跑一次同样的
`add`：

```yaml
# <profile>/pnpm-workspace.yaml —— key 由失败的那次 add 打印出来
allowBuilds:
  dsh-sessionflow@git+https://github.com/HarryHeYu/dsh-sessionflow.git#<sha>: true
```

这一步**不能跳过**：插件是 TypeScript 写的，`prepare` 负责在安装时编译出 `lib/`。

### 从本地目录安装

要改插件本身？用 `file:` 前缀：

```sh
git clone https://github.com/HarryHeYu/dsh-sessionflow
cd dsh-sessionflow && npm install && npm run build
dsh plugin --profile web add file:$PWD
```

**用 `file:`，不要用裸路径。** 裸路径会变成 pnpm 的 `link:` 依赖，而 DSH 配的
`nodeLinker: hoisted` 不会为它创建 symlink —— 安装看起来成功了，但 profile
**读不到** `dsh.bundle`，插件不会加载。`file:` 走的是拷贝，能正常工作。

### 确认已加载

```sh
dsh --profile web --dump-config | grep dsh-sessionflow
```

应当看到 `- id: dsh-sessionflow`。若 core 缺失，工具仍会注册，但每次调用都会
以明确的错误指出它尝试运行的 `voyager` 可执行文件 —— 见「疑难排查」。

## 工具

| Tool | 回答什么 |
|---|---|
| `sessionflow_search` | "找一下我修 parser 的那个会话。" |
| `sessionflow_recent` | "我这周都干了什么？" |
| `sessionflow_session` | "那个会话是关于什么的？" |
| `sessionflow_current_work` | "**这个**项目我做到哪了？" |
| `sessionflow_continue` | "接着做。" |
| `sessionflow_merge` | "把这些会话合起来，我接着做。" |

六个 tool 统一用 `sessionflow_*` 前缀，不存在第二套 `voyager_*` 名称。
每个 tool 返回结构化数据 + 适合模型消费的渲染。

## 配置

插件按顺序寻找核心：配置的 `voyagerBin` → `PATH` 上的 `voyager`（Windows 上还有
`voyager.exe`）→ `py` / `python` / `python3` 执行 `-m voyager.cli`。每个候选都会用
版本探测验证，所以装了多个 Python 的机器会选到真正装了包的那个。

在 profile patch 里覆盖：

```yaml
# cordis.patch.yml
- id: dsh-sessionflow
  config:
    voyagerBin: 'C:/path/to/voyager.exe'   # 可选
    timeoutMs: 30000                        # 可选，单次调用超时
```

核心缺失时，tool 会给出可执行的错误信息，而不是返回空结果。

## 兼容性

| 插件 | DSH | sessionFlow bridge schema | 状态 |
|---|---|---|---|
| 0.1.0 | 0.1.5-rc.3 | 1 | tested |

DSH 处于 Developer Preview，接口会变。插件声明它需要的 bridge `schema_version`，
对更旧的核心**明确报错**；不声称支持"所有未来版本"。

## 验证状态

按**实际达到的等级**如实标注，不向上冒充。

| 能力 | 状态 | 证据 |
|---|---|---|
| bridge 机制：解析、超时、坏 JSON、非零退出、schema 闸门 | **PASS（unit）** | `tests/bridge.test.ts`，stub 可执行文件 |
| 与真实核心的 JSON 往返 | **PASS（integration）** | `tests/bridge.test.ts`，真实 `voyager` + 临时索引 |
| 六个 tool 用真实 `defineTool` 注册 | **PASS（unit）** | `tests/plugin.test.ts` |
| DSH bundle discovery | **LIVE VERIFIED** | `dsh plugin --profile … install` 把 `dsh-sessionflow` 写进 `dsh.profile.bundles` |
| DSH composition tree | **LIVE VERIFIED** | `dsh --profile … --dump-config` 显示 `- id: dsh-sessionflow` |
| 真实 Agent 能看到 tool 注册 | **LIVE VERIFIED** | 真实 DSH 回合的 request header 含全部六个 schema |
| 自然语言自主选择 tool | **LIVE VERIFIED** | 只问"我之前这个项目做到哪了？"（未提任何 tool 名），Agent **第一个动作**就是 `sessionflow_current_work` |
| 真实 Agent 调用 tool | **LIVE VERIFIED** | DSH session log 中 4 条 `tool/call` 记录 |
| sessionFlow bridge 真实执行 | **LIVE VERIFIED** | 返回真实索引数据（266 sessions / 150,089 events / 8 providers） |
| 跨 Agent 上下文检索 | **LIVE VERIFIED** | 返回的 WorkThread 成员横跨 `claude` 与 `zcode`；搜索命中横跨 `zcode`/`claude`/`grok` |
| `dsh plugin add` 落地本地包链接 | **NOT VERIFIED** | pnpm 11.22.0 `hoisted` linker 没建链接；已知可用的第三方 bundle 表现相同 ⇒ 属环境问题 |

完整记录与 tool 调用明细见 [`docs/live-verification.md`](docs/live-verification.md)。

使用环境：`@deepseek-ai/dsh` 0.1.5-rc.3、`@deepseek-ai/cordis` 4.0.2、
Node 22.22.2、Windows。

## 疑难排查

**工具注册了，但每次调用都失败。**
core 缺失或不在 `PATH` 上。直接检查：

```sh
voyager --version
```

若失败，按[安装](#安装)从源码装 core，并确认提供 `voyager` 入口的解释器就是 DSH
继承到的那个。错误信息里会写出它尝试运行的可执行文件。

**`pip install voyager` 装错了东西。**
确实会 —— PyPI 上的 `voyager` 是一个毫不相干的最近邻搜索库。先卸载，再从
sessionFlow 仓库装。

**`dsh plugin add dsh-sessionflow` 找不到包。**
插件不在 npm 上。改用 GitHub 写法：

```sh
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
```

**`add` 报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`。**
pnpm 默认不允许 git 来源的包执行构建脚本。错误里会打印它需要的那个 key ——
写进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`，再跑一次同样的 `add`。
这一步**不能跳过**：插件是 TypeScript，`prepare` 负责编译 `lib/`。

key 必须**原样照抄**，包括解析出的 commit。pnpm 11 下短名形式
（`dsh-sessionflow: true`）**不够**，仍会报同一个错 —— 已对 pnpm 11.22.0 实测。

**`add` 报 `declares no dsh.bundle`，且 `node_modules` 是空的。**
你加的是**裸本地路径**。pnpm 会把它变成 `link:` 依赖，而 DSH 配的
`nodeLinker: hoisted` 不创建 symlink，于是 profile 读不到包里的 `dsh.bundle`。
改用 `file:`：

```sh
dsh plugin --profile web add file:$PWD
```

若用的是 `github:` 或 `file:` 却仍看到这条警告，那就是别的原因 —— 检查包里
是否存在 `lib/`，因为 DSH 读的是**已安装副本**的 manifest。

**插件加载了，但 profile 里看不到 `dsh-sessionflow` 那一行。**
跑 `dsh --profile <p> --dump-config`，找 `- id: dsh-sessionflow`。
找不到的话 bundle 没被发现 —— 见上面两条。

## 安全

- 参数以 **argv 数组**传给 `spawn`，绝不拼接 shell 字符串——含 `;`、`"` 或中文的查询
  是数据，不是语法。
- 插件**没有任意 shell 执行能力**。它只能调用核心的只读接口，外加 `voyager merge`
  （唯一的写操作，用于持久化 WorkThread）。
- 只读取 sessionFlow 已经建好的索引；不扫描、不复制、不上传 provider 会话文件，
  也不发送任何网络请求。

## 开发

```sh
npm install
npm run build     # tsc -> lib/
npm test          # 先构建，再跑 node --test（bridge 机制 + 真实核心）
```

`tests/bridge.test.ts` 用 stub 可执行文件覆盖解析、超时、坏 JSON、非零退出和兼容性闸门，
再用**真实核心**在临时索引上跑一遍完整的 JSON 往返。这些临时索引建在系统临时目录下，
**测试退出时会被删除**；用 `SESSIONFLOW_TEST_TMPDIR` 可以改到别处。

## 许可

MIT，见 [LICENSE](LICENSE)。

---

[English](README.md) · [sessionFlow](https://github.com/HarryHeYu/sessionFlow)
