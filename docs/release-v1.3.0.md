# Release v1.3.0 — 第七个 tool（发布候选）

状态：**Release Candidate，尚未创建 Tag、尚未发布 GitHub Release**。
本文件是发布准备记录，不是"已发布"声明。发布需要维护者另行授权。

建立在 Plugin `main` = `96567af276406f8121cb17ee0a8f5654f5b4962a`
（PR #10 squash 合并，作者 @SunnyRad）之上。Core `v1.5.0` 已于
2026-11-14 正式发布，tag peeled = `ab42a2550e66b4e2f998a757c88cfd2d2987d4ca`。

## 本版改动

1. **新增 `sessionflow_evidence_verify`（第七个 tool）**：对 Core v1.5.0 加性
   `evidence_verify` API op 的薄 `callOp()` 透传。返回 Core 的五态 verdict
   dict 原样，不做退出码解释、不重判 verdict。`exit_code` 是**结果字段**，
   不是进程退出码，因此四个非零判决不会被压成 `CLI_FAILED`。
2. **参数在 spawn 之前校验**：`session_id` 非空、`seq` 为整数、`digest` 为
   8 位十六进制（可带前导 `#`）。畸形引用本地抛 `ParameterError`，零 spawn。
3. **两处诚实边界**：`MATCH` 只表示"索引里的事件与引用一致"，不表示 claim
   为真；`INVALID_REFERENCE` 是 Core 支持的态，但本 tool 在 spawn 前 pre-reject
   畸形引用，因此**经本 tool 不可达**，对直接调用 Core 的调用方仍可达。
4. 中英 README 的**当前**工具面由 six → seven；历史 v1.2.0 的六工具
   LIVE VERIFIED 记录与 pairing 行原样保留。CHANGELOG 增加正式版本条目。
5. 安装 pin 由 Core `v1.3.1` 更新为 Core **`v1.5.0`**，并把
   `tests/readme-consistency.test.ts`、`CONTRIBUTING.md` 同步对齐。
6. **CHANGELOG 结构修正**：把原 `## [Unreleased]` 正式升为 `## [1.3.0]`，
   并按文件头部"newest first"的声明把它移到 `[1.2.0]` 之前（原先 `[Unreleased]`
   位于 `[1.2.0]` 之后）。因此 1.3.0 条目**不仅包含第七个 tool**，还包含
   1.2.0 之后累积、此前从未发布的那批修复（PR #5 的 argv/长度边界、#6 的
   `VOYAGER_BIN` 泄漏、`truncated` 信号、stub 形状等）。这些不是本版新写的
   代码，但随本版首次发布，发布说明不隐瞒这一点。

刻意**未改动**：`BRIDGE_SCHEMA_VERSION` / `REQUIRED_SCHEMA_VERSION`（仍为 1）、
`REQUIRED_CORE_REF`、`peerDependencies`、`resolveVoyager()`、CI 矩阵、
既有六个 tool 的实现。新 op 是加性的，不是协议升级。

## 兼容性

| plugin | core | bridge schema | 说明 |
|---|---|---|---|
| **1.3.0** | `v1.5.0` | 1 | 当前组合；七个 tool 全部可用 |
| 1.2.0 | `v1.3.1` | 1 | 历史组合；六个 tool |
| 1.1.0 | `v1.3.0` | 1 | 历史组合；六个 tool |

- **正向**：Core v1.5.0（schema 1，10 ops，含 `evidence_verify`）驱动本 tool，
  五态按名透传，真实 `MATCH` 返回 12 键（含 `session` 21 键、
  `source_stat` 8 键、`found_kind`、`found_summary`）。
- **反向**：Core v1.4.1（9 ops，无该 op）→ `unknown op: 'evidence_verify'`
  **能力错误**，不是 `NOT_FOUND`，更不是 `MATCH`；原有六个 tool 不受影响。
- **缺 Core**：`VOYAGER_NOT_FOUND` 给出可执行的安装提示，工具仍可注册。
- 六个既有 tool 无回归：注册数由 6 → 7，六个原名称与参数 schema 未变。

## 验证（维护者，2026-11-15）

| 项 | 结果 |
|---|---|
| `tsc -p tsconfig.json` | rc=0 |
| 完整套件（真实 Core v1.5.0） | **119 passed / 0 failed / 0 skipped**（集成行真实执行，非跳过） |
| Plugin main CI（#10 合并后） | run `43676495254`，6/6 success |
| PR #10 CI | run `43610000111`，6/6 pass；0 unresolved review threads |
| 真实资产 sha256 | wheel `2f5557c8…`、sdist `7020ebf9…` 与 Release API digest 一致 |
| 五态跨仓实证（编译后 tool × 正式 v1.5.0 wheel） | MATCH/MISMATCH/NOT_FOUND/UNVERIFIABLE 按名透传；INVALID_REFERENCE 由 tool 本地拒绝；`#digest`、无 digest 路径均通过 |
| 旧 Core 降级（正式 v1.4.1 wheel） | `unknown op` 能力错误 |
| 冷启动 / 缺 Core | `tests/cold-start.test.ts` + bridge VOYAGER_NOT_FOUND 路径覆盖，全绿 |
| 发布工件清单 | `npm pack --dry-run` 文件清单核对，含 `lib/tools/evidence-verify.js` |

合成索引、隔离 HOME、隔离 venv 均在仓库外的临时目录完成；未扫描真实用户历史。

## 剩余门禁（发布前）

1. **创建并推送 annotated tag `v1.3.0`** —— 需维护者明确授权，本轮不执行。
2. 创建 GitHub Release（非 draft）并标记 latest。
3. tag 发布后复核中英 README 的 current-release 链接可访问
   （`scripts/check-readme-links.mjs`，可选在线检查，不在 `npm test` 内）。
   **本轮已跑，当前 exit 1 是预期的 pre-tag 状态，不是缺陷**：

   ```text
   OK       README.md: HarryHeYu/sessionFlow v1.5.0
   OK       README.zh-CN.md: HarryHeYu/sessionFlow v1.5.0
   FAIL     README.md: HarryHeYu/dsh-sessionflow tag v1.3.0 does not exist
   FAIL     README.zh-CN.md: HarryHeYu/dsh-sessionflow tag v1.3.0 does not exist
   ```

   两个 Core pin 已指向真实发布的 tag；只有本仓尚未创建的 `v1.3.0`
   tag 失败。这与 Core 仓的 tag/README 时序问题同类，但本轮**不改**
   离线契约测试、不提前建 tag。tag 推送后此检查应为 exit 0。
4. 发布后把 "release candidate — tag not yet published" 的括注去掉；
   CHANGELOG 条目改为正式日期。
5. Plugin #9 在第七个 tool 正式发布前保持 Open。

## 发布时序（tag 落在最终文案上，事后不改 tag）

本仓**没有** release workflow（`.github/workflows/` 只有 `cold-start.yml`），
所以发布 = 打 tag + 建 GitHub Release，不存在"CI 需要 tag 才能过、tag 又需要
CI 才能建"的环。`check-readme-links.mjs` 是**可选在线检查**，不在 `npm test`
内，也不阻塞任何 CI job。

顺序：

1. 合并本 RC：README 带 `release candidate — tag not yet published`，
   这是当时唯一诚实的说法。
2. **打 tag 之前**，合并一个只改文档的小 PR：去掉 RC 括注、CHANGELOG 日期
   改成正式日期。此时 main 短暂声称一个尚未存在的 tag —— 窗口以分钟计，
   且没有任何 CI 门禁依赖该链接。
3. 在**那个** commit 上打 annotated tag `v1.3.0`，同刻创建 Release
   （非 draft、latest）。
4. 发布后跑 `scripts/check-readme-links.mjs`，必须 exit 0。
5. 发布后不再改 tag。

为什么不选"先打 tag、再补文档 commit"：那样 tag 树里的 README 会永远停在
RC 措辞，而 tag 不可变。选 2 的唯一代价是第 2→3 步之间的短暂窗口，比让
tag 永久带着过时措辞小得多。

## 非阻塞观察（不进入本版修复）

- ~~PR #10 的测试注释引用 `reports/c1-phase2-execution.md`，该文件不在两仓树中
  （悬空出处）。~~ **本版已修**：`tests/evidence-verify.test.ts` 与
  `tests/fixtures/stub-evidence.mjs` 的注释改为指向真实来源（sessionFlow
  `v1.5.0` 的 `voyager/evidence.py::verify()` + Release 链接 + 可重复的复现步骤），
  12 键结构由同文件里的断言钉住，不再依赖树外文档。
- stub 只建模 `NOT_FOUND` 的 8 键早返回分支；真实 Core 在"session 存在但
  seq 缺失"时返回 10 键（仍带 `session`/`source_stat`）。工具是 verbatim
  透传，10 键情形实测正确流经。
- `guarded()` 会把 `VoyagerError('OP_ERROR', …)` 重包成普通 `Error`，因此
  工具边界上 `error.code === 'OP_ERROR'` 不可观测（仅 message 可见）。
  这是既有六个 tool 的共享行为，非本版引入。
- `REQUIRED_CORE_REF` 仍是历史 commit `f2a6445`（用于运行时安装提示），
  与 README 的 `v1.5.0` pin 不同源。改它属于 bridge 行为变更，需单独决策。
