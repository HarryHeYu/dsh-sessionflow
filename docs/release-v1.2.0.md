# Release v1.2.0 — 渠道兼容跟进（R1）

发布日期：2026-10-31。这是章程 R1（渠道兼容跟进）的第一个节奏点：上游
dist-tag 移动后 48 小时内完成验证与发布。

## 上游变化

2026-10-31 实查 `@deepseek-ai/dsh-tools` dist-tags：

| dist-tag | 版本 | cordis 要求 |
|---|---|---|
| `next` | **0.2.1-rc.5** | `~4.0.5` |
| `alpha` | **0.2.2-alpha.2** | `~4.0.6-alpha.1` |

两条新线都不被 v1.1.0 的 peer range 覆盖（node-semver 的 tuple 规则：
`>=0.2.1-alpha.1` 不接纳 `0.2.1-rc.5`——tuple 不同）。用户在 `next`/`alpha`
渠道上 `dsh plugin add` 会遇到 ERESOLVE。

## 本版改动

1. **peerDependencies 扩展**：
   - `@deepseek-ai/dsh-tools` 增加 `>=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-alpha.1 <0.3.0-0`；
   - `@deepseek-ai/cordis` 增加 `>=4.0.6-alpha.1 <5.0.0`。
2. **验证**（Windows 本机 + CI Linux 双覆盖）：
   - Windows 本机 cold-start：install → bundle → prepare → profile layer 四关
     PASS，且已装插件的 bridge 对真实 core（voyager 1.3.0，schema 1，9 ops）
     完成一次真实调用（两个渠道各一轮）；
   - Linux cold-start CI 新增 `file-0211rc5` / `file-0222a2` 两行，跑完整
     五关（含 boot 加载门）。
3. `tests/peer-range.test.ts` 的 HOSTS 钉住列表同步加入两行。

## 验证状态

| DSH | install resolves | DSH loads it | tool call answered |
|---|---|---|---|
| 0.2.1-rc.5 (`next`) | yes | yes（CI Linux boot 门） | yes（Windows bridge 门 + CI） |
| 0.2.2-alpha.2 (`alpha`) | yes | yes（CI Linux boot 门） | yes（Windows bridge 门 + CI） |

bridge schema 不变（1），工具面不变（六个 `sessionflow_*`）。

## 升级

`dsh plugin add github:HarryHeYu/dsh-sessionflow` —— 无需手工 ERESOLVE
处理；peer range 已覆盖当前全部三个活跃渠道（`0.1.5-rc.3` 除外的历史线
仍被接纳）。
