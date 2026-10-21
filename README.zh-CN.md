# dsh-sessionflow

[![cold-start](https://github.com/HarryHeYu/dsh-sessionflow/actions/workflows/cold-start.yml/badge.svg)](https://github.com/HarryHeYu/dsh-sessionflow/actions/workflows/cold-start.yml)
[![release](https://img.shields.io/github/v/release/HarryHeYu/dsh-sessionflow)](https://github.com/HarryHeYu/dsh-sessionflow/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/HarryHeYu/dsh-sessionflow/blob/main/LICENSE)

**在 DeepSeek Harness 里，跨 AI 编码 Agent 继续你的工作。**

用 [sessionFlow](https://github.com/HarryHeYu/sessionFlow) 检索历史、恢复上下文，并继续你在
Codex、Claude Code 等受支持 Agent 中做过的工作。

|  |  |
|---|---|
| **是什么** | 一个薄的 DSH 插件，把 sessionFlow 的接续层以六个 `sessionflow_*` tool 暴露出来。 |
| **为什么用** | 在 Codex / Claude Code / Grok / ZCode 里开始的工作不必停在 Agent 边界——可以在 DSH 里接着做，目标、文件、命令和未完成事项都还在。 |
| **安装** | `dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow` —— [详见](#安装)。需要可用的模型 provider **以及** sessionFlow core。 |
| **试用** | 直接用自然语言说：*"继续我之前在 Claude Code 里对这个仓库做的工作。"* 完整流程见 [5 分钟上手指南](https://github.com/HarryHeYu/sessionFlow/blob/main/docs/QUICKSTART.md)。 |
| **当前版本** | [v1.1.0](https://github.com/HarryHeYu/dsh-sessionflow/releases/tag/v1.1.0) · DSH 0.1.5-rc.3 / 0.2.0-rc.2 / 0.2.1-alpha.4（工具调用已跑通）· Node ≥ 22.19 · bridge schema 1 |
| **已知限制** | 由 Agent 发起的 native resume **尚未**验证 —— 见 [验证状态](#验证状态) |

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
- [sessionFlow / Voyager](https://github.com/HarryHeYu/sessionFlow) ——
  **一个独立的外部依赖**，从**它的 GitHub tag** 安装并建好索引。本插件是薄适配层，
  自带零 Python 核心。它**没有发布到 PyPI**：PyPI 上的 `voyager` 是一个毫不相干的
  最近邻搜索库，裸跑 `pip install voyager` 会装错项目。
- Node.js **22.19+**

也就是说这里有**两个彼此独立**的依赖：DSH 需要模型 provider 才能运行，本插件需要
sessionFlow core 才能回答任何问题。本插件不会引入第三个。

## 安装

两部分走**不同的渠道**，没有一条命令能同时装好；而且其中一件是**故意**不上包管理器的：

| | 来自哪里 | 安装 |
|---|---|---|
| **核心** — sessionFlow | **GitHub tag**；不在 PyPI | `pipx install "voyager[all] @ git+…@v1.3.0"` |
| **插件** — 本仓库 | **DSH 的插件机制**；不在 npm | `dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow` |

先装核心：没有它，六个工具照样注册，但每次调用都会失败并指名缺的那个二进制。

两个常见误解：

- **`pip install voyager` 装的是别的项目。** 那个 PyPI 名字属于一个毫不相干的
  最近邻搜索库；核心尚未发布到 PyPI，所以下面这条 `@ git+…` 是唯一正确的形式。
  推荐用 `pipx`，它把 CLI 装在独立环境里；而 tag 安装才是可复现的。
- **插件不是 npm 包。** `dsh plugin add dsh-sessionflow` 找不到任何东西，要用
  `github:` 形式。

```sh
# 1. 核心（pin 到本插件版本实测过的发布 tag）
pipx install "voyager[all] @ git+https://github.com/HarryHeYu/sessionFlow.git@v1.3.0"
voyager --version     # 应当输出 1.3.0
voyager scan
voyager doctor        # 确认核心能跑，并报告 bridge schema 1

# 2. 本插件，直接从 GitHub 装
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
dsh --profile web
```

没有 `pipx`？`python -m pip install "voyager[all] @ git+https://github.com/HarryHeYu/sessionFlow.git@v1.3.0"`
也可以。用 `python -m pip` 是有意的：Windows 上 `pip` 常常不在 `PATH` 里，而 `python` 在。

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

### 同一仓库有多条 WorkThread 时

一个项目可以同时有多条 active WorkThread（两条工作线，或者一条被关闭后又重开的）。
这些 tool **不会**替你选：

* `sessionflow_current_work` 会返回 `thread_ambiguous: true`，在 `thread_candidates`
  里列出全部候选（`id` / `title` / `updated_at` / `goal`），同时仍把最近活动的那条放在
  `thread` 里 —— 并由 `thread_default_reason` 标明这是**默认**，因为活动时间不是你的决定；
* `sessionflow_continue` 与 `sessionflow_merge` 接受 `thread_id`，Agent 可以把你选的那条传进去；
* 只有一条线程时不会多出任何字段；`thread_id` 不存在时会被如实报告，而不是悄悄换成别的线程。

让 Agent 问你要哪条，或者你直接给出 id。DSH 之外同理：`voyager continue` / `voyager switch`
会打印候选并拒绝猜测，`voyager status` 报 `AMBIGUOUS` 而不是 `NO_THREAD`。

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

**两个仓库各自独立发版**——插件 `1.1.0` 配核心 `1.3.0` 是当前正确的组合，
版本号不需要相同。真正约束它们的是 **bridge schema**：插件在 `src/bridge.ts`
里声明 `REQUIRED_SCHEMA_VERSION`，核心在 `voyager integration-info --json` 里报告它。

| 插件 | 核心 | bridge schema |
|---|---|---|
| 1.1.0 | `v1.3.0` | 1 |

六个 tool 的兼容性由**非模型**的契约测试保证（输入 → bridge 调用 → 结果格式化，
对着真实核心和临时索引）。模型**自主选择**这些 tool 在真实模型回合里被观察到过，
但**没有**可重复的端到端套件——见[验证状态](#验证状态)。

DSH 处于 Developer Preview，接口会变。按渠道如实标注达到的等级：

| 插件 | DSH | bridge schema | 能装上 | DSH 能加载 | 能回答 tool 调用 |
|---|---|---|---|---|---|
| 1.1.0 | `0.1.5-rc.3` | 1 | 是 | 是 | 是 |
| 1.1.0 | `0.1.7-rc.2` | 1 | 是 | 未跑 | 未跑 |
| 1.1.0 | `0.2.0-rc.2`（`next`） | 1 | 是 | 是 | 是 |
| 1.1.0 | `0.2.1-alpha.4`（`alpha`） | 1 | 是 | 是 | 是 |

"未跑"不等于"大概没问题"——`0.1.7-rc.2` 被放行只是为了不让用户卡在安装报错上，
此外不作任何声明。`latest` 是上游陈旧的 `0.0.1-rc.1`，**故意不收录**：
没有证据表明插件在第一个 release candidate 上能用。

插件声明它需要的 bridge `schema_version`，对更旧的核心**明确报错**；
不声称支持"所有未来版本"。`tests/peer-range.test.ts` 钉住这张表，
所以放宽范围时必须先决定新那一行的状态，而不是悄悄放进来。

## 验证状态

按**实际达到的等级**如实标注，不向上冒充。

| 能力 | 状态 | 证据 |
|---|---|---|
| bridge 机制：解析、超时、坏 JSON、非零退出、schema 闸门 | **PASS（unit）** | `tests/bridge.test.ts`，stub 可执行文件 |
| 与真实核心的 JSON 往返 | **PASS（integration）** | `tests/bridge.test.ts`，真实 `voyager` + 临时索引 |
| 六个 tool 用真实 `defineTool` 注册 | **PASS（unit）** | `tests/plugin.test.ts` |
| DSH bundle discovery | **LIVE VERIFIED** | `dsh plugin --profile … install` 把 `dsh-sessionflow` 写进 `dsh.profile.bundles` |
| DSH composition tree | **LIVE VERIFIED** | `dsh --profile … --dump-config` 显示 `- id: dsh-sessionflow` |
| DSH 真的 import 并 apply 了插件 | **INSTALL VERIFIED（Linux CI）** | 启动能走到凭证门且无 import 报错；**`--dump-config` 单独证明不了这一点** —— 它从不 import 插件 |
| 干净机器上的 `github:` 安装 | **INSTALL VERIFIED（Linux CI）** | `dsh plugin add github:HarryHeYu/dsh-sessionflow`，配合 pnpm 打印的 `allowBuilds` key |
| 干净机器上的 `file:` 安装 | **INSTALL VERIFIED（Linux CI）** | `dsh plugin add file:<checkout>` |
| 真实 Agent 能看到 tool 注册 | **LIVE VERIFIED** | 真实 DSH 回合的 request header 含全部六个 schema |
| 自然语言自主选择 tool | **LIVE VERIFIED** | 只问"我之前这个项目做到哪了？"（未提任何 tool 名），Agent **第一个动作**就是 `sessionflow_current_work` |
| 真实 Agent 调用 tool | **LIVE VERIFIED** | DSH session log 中 4 条 `tool/call` 记录 |
| sessionFlow bridge 真实执行 | **LIVE VERIFIED** | 返回真实索引数据（266 sessions / 150,089 events / 8 providers） |
| 跨 Agent 上下文检索 | **LIVE VERIFIED** | 返回的 WorkThread 成员横跨 `claude` 与 `zcode`；搜索命中横跨 `zcode`/`claude`/`grok` |
| 用续接上下文接着别的 Agent 干活 | **LIVE VERIFIED** | 六个合成场景、真实模型、真实索引 —— 见 [`docs/p8-live-verification.md`](docs/p8-live-verification.md) |
| 交接记录故意与磁盘不符时的自主选择 | **LIVE VERIFIED** | 夹具里的会话声称做了工作，而 checkout 里并没有；Agent 核对了文件，拒绝照抄该说法 |
| 同一仓库两条 active WorkThread | **LIVE VERIFIED** | Agent 列出两条、拒绝选更新的那条，并说明"最新"不是判决 |
| 从**真实 Provider 会话文件**续接（discovery → 解析 → 索引 → Agent） | **LIVE VERIFIED** | 3 个真实 Codex rollout + 3 个真实 Claude Code 会话复制进隔离 HOME，由真实适配器扫描，再由真实 Agent 续接 —— 见 [`docs/p9-live-verification.md`](https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p9-live-verification.md) |
| `sessionflow_merge` 可调用且语义正确 | **LIVE VERIFIED** | 集成测试跑真实 `voyager merge --json`（两个来源、provenance、冲突保留、结果确定），并有真实回合按 id 调用它 |
| `sessionflow_merge` 在**未被点名**时被选中 | **NOT VERIFIED** | 自主回合用 `current_work` + `recent` + `search` + `session` 答对了，但从未调用 `merge` |
| 多线程歧义被如实报告而非猜测 | **LIVE VERIFIED** | 同一仓库两条 active WorkThread：Agent 列出双方、拒绝取更新的那条，并说明"最新"不是决定 |
| Agent 触发 native resume | **NOT VERIFIED** | 没有场景真的拉起另一个 Agent 的会话；retained / `SOURCE_MISSING` 的会话被正确描述为只有上下文。`claude`/`codex` 虽已安装，但真实 resume 会消耗用户凭证并在其真实环境里新建会话 |
| `dsh plugin add <裸本地路径>` | **已知限制** | 裸路径会变成 pnpm 的 `link:` 依赖，而 DSH 配的 `nodeLinker: hoisted` 不创建 symlink，于是包里的 `dsh.bundle` 根本不会被读到。改用 `file:` 或 `github:` —— 两者都已在 Linux CI 上验证。见[疑难排查](#疑难排查) |

Linux 冷启动 job 每次推送都会跑：
[`.github/workflows/cold-start.yml`](.github/workflows/cold-start.yml) 用
`scripts/cold-start.sh` 在**一次性的 `DSH_HOME`** 里把两条安装路径各跑一遍，
宿主工具链精确固定（dsh 0.1.5-rc.3、pnpm 11.22.0、Node 22.22.2、Python 3.13）。
它不需要模型：启动会停在凭证门，而"能到那里"正是插件已加载的证据。

完整记录与 tool 调用明细见 [`docs/live-verification.md`](docs/live-verification.md)。

使用环境：`@deepseek-ai/dsh` 0.1.5-rc.3、`@deepseek-ai/cordis` 4.0.2、
Node 22.22.2。LIVE VERIFIED 那些行是在 Windows 上真实跑出来的；安装与加载
（INSTALL VERIFIED）在 **Linux** 上另有独立的 CI 证据。

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
