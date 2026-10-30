# dsh-sessionflow 项目书 · 生态位与下一阶段路线

> 状态基线：v1.1.0（2026-10）。本文档回答两个问题：在 2026 年 10 月的 DSH 生态里，
> 这个插件站在哪；下一步往哪走。事实性内容以 README 与 docs/ 各验证文档为准，
> 本文不重复其数据，只做战略层综述。

## 1. 生态现状（2026-10-31 实查）

DSH 插件生态在过去两个多月进入井喷期，GitHub 实查两个标志性新仓库：

| 仓库 | 星数 | 信号 |
|---|---|---|
| Ebony-Vinyl/dsh-our-free-model | ★52k+ | 8 月中旬后创建；"装上即用免费前沿模型"——分发能力极强的生态位 |
| YuJunZhiXue/dsh-purge | ★13.7k | 9 月中旬后创建；提示词层工具，同样短时间起量 |

结论：DSH 的 `dsh plugin add github:…` 通道已经有真实流量，插件是这个生态的
一等公民。本插件 2026-09 已进入第三方 awesome-dsh 目录
（HarryHeYu__dsh-sessionflow.yml），属于生态内**最早一批经过完整验证**的
非模型类插件：六个 tool 全部 LIVE VERIFIED，冷启动 CI 覆盖 `github:` 与
`file:` 两条安装路径。

## 2. 当前生态位

- **功能位**：跨 agent 会话接续层（sessionFlow core 的 DSH 适配面），生态里
  尚无同类竞争者；模型类插件（free-model、purge）与工具类插件互不挤占。
- **工程位**：本仓库的兼容性纪律（peer ranges 逐渠道验证、bridge schema 闸门、
  四渠道兼容表）在生态内是稀缺的——多数新插件未做渠道矩阵。这既是成本也是
  信任资产：上游 DSH 每发一个新 rc，本插件可以第一个挂上"已验证"标。
- **分发位**：GitHub 直装 + awesome-dsh 收录已完成；README 双语、发布
  changelog、演示文档（docs/demo）齐备。缺口在搜索与话题标签、以及与
  DSH 上游发版的联动节奏。

## 3. 下一阶段路线（按优先级）

### R1 · 渠道兼容跟进（维护性，随上游走）
对 DSH 新发布的 rc/alpha 渠道跑安装-加载-工具调用三关验证，更新
peerDependencies 与 README 兼容表。每次上游发版 48 小时内完成是目标节奏——
生态井喷期"最新可用"本身就是流量。

### R2 · FigCraft 的 DSH 插件管线（增殖，复用本仓库的全部经验）
FigCraft（论文矢量图引擎，见 E:\code\figcraft\PROJECT-PLAN.md）M3 落地
MCP 后，按本仓库同款骨架出 `dsh-figcraft` 插件：cordis.patch.yml、
dsh.bundle、渠道兼容矩阵、冷启动 CI 直接复制改造。首个 "FigCraft as
DSH plugin" 乘上生态井喷窗口期。

### R3 · 可发现性增强（一次性，半天）
- README/topics 补齐 GitHub topics（dsh、deepseek、plugin、mcp、session）；
- GitHub Releases 挂 CHANGELOG 摘要与 tag 签名；
- 在 awesome-dsh 的 yml 里确认 keywords 与截图字段是否最新。

### R4 · 社区面（低频持续）
Issues 模板 + 讨论区开关；生态内互链（README 的 plugin 列表互换）；重大
版本（如 native resume 验证完成）在 DSH 社区渠道发一次 announcement
（docs/community/ 已有 announcement 底稿可更新）。

## 4. 风险

- DSH Developer Preview 接口变动（历史已发生 4 次）：靠渠道矩阵消化，
  不承诺"所有未来版本"。
- 生态标签混杂：free-model/purge 类仓库带来的是泛流量，与工具类插件的目标
  用户重合度有限——预期管理上以"装完即在 list 里可见"的功能价值叙事为主。
- sessionFlow core 与本插件双仓库发版节奏耦合：bridge schema 闸门已把风险
  收敛为"明确报错"，维护成本可接受。

## 5. 一句话

生态位是"井喷期里工程纪律最好的工具类插件"；下一步所有动作都服务两个词：
**跟上游的速度**（R1）与**把验证过的方法复制到第二个插件**（R2）。
