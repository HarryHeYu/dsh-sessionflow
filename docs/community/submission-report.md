# Community Submission Report

**Date:** 2026-10-12 · **Product version:** v1.1.0 (unchanged) · **Status:
PR SUBMITTED — awaiting maintainer review. Not listed, not merged.**

No product code, tag or Release was changed. No npm/PyPI publish. The only
outward-facing action taken was one pull request to a community list, which was
explicitly authorised.

---

## 1. Target community repository

| | |
|---|---|
| Repository | **`awesome-dsh-plugin/awesome-dsh-plugin`** |
| URL | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin |
| Owner type | **Organization `awesome-dsh-plugin`** — an independent community org |
| Is it the official DSH repo? | **No.** The official repository is `deepseek-ai/deepseek-harness`; this is a separate community project with no parent relationship (`fork: false`, `parent: none`) |
| Licence | CC0-1.0 |
| Size at submission | 4,508 entries, 18,502 stars, default branch `main` @ `4726e1de` |
| Rules source | `contributing.md` (sha `d92b1763…`, 29,917 B) + `.github/pull_request_template.md`, read from the repository itself |

**Duplicate check before submitting:** no file matching `harryheyu` or
`sessionflow` existed under `data/plugins/`, and neither generated README
mentioned the plugin. The list had **not** already listed it.

### Rules that applied (read from the repo, not assumed)

One file, `data/plugins/<owner>__<repo>.yml`, exactly one level deep and ending
in `.yml`; only `description.en` is required; the READMEs are generated and must
**not** be hand-edited or committed; the repo must declare `dsh.bundle`, be ≥ 1
day old, carry the `dsh-plugin` topic, and its description must be accurate with
no marketing. A per-PR limit of 3 entries applies.

---

## 2. The pull request

| | |
|---|---|
| **PR URL** | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7226** |
| Title | `Add HarryHeYu/dsh-sessionflow (session)` |
| State | **OPEN** (not draft, not merged) |
| Head → base | `HarryHeYu:add-dsh-sessionflow` → `awesome-dsh-plugin:main` |
| Head commit | `9c9dc728a3dc33c63d0f9fd2744d8705eedaf8a8` |
| Base commit | `4726e1de45885d27e526b027d04c465155d26fbc` |
| Mergeable | `MERGEABLE`, merge state `CLEAN` |
| Review | none yet (`reviewDecision` empty, 0 comments, no labels) |
| Opened | 2026-10-12 15:50 UTC |

### Files changed — exactly one

```
data/plugins/HarryHeYu__dsh-sessionflow.yml   +6 / −0
```

No other file was touched: the generated `README.md` / `README.zh.md` were
reverted before committing, and the stale-fork guard saw `+1 / −0` entry files.

### The entry

```yaml
url: https://github.com/HarryHeYu/dsh-sessionflow
name: HarryHeYu/dsh-sessionflow
category: session
description:
  en: 'Continues work across coding agents inside DeepSeek Harness: six sessionflow_* tools query a local session index built by sessionFlow to find past work, show where the current project left off, and hand the goal, files and open items to the next agent. Everything stays local — no cloud, no telemetry.'
  zh: '在 DeepSeek Harness 里跨编码 Agent 继续工作：六个 sessionflow_* 工具查询 sessionFlow 构建的本地会话索引，找回过去的工作、看清当前项目做到哪了，并把目标、涉及文件与未完成事项交给下一个 Agent。全程本地运行——无云端、无遥测。'
```

`session` is the closest category — the plugin's whole job is session
continuity. The description states only what the code does; it makes no claim
about native resume.

---

## 3. Check results

| Check | Result | Detail |
|---|---|---|
| `check` (PR check) | **pass** | 7m1s — run [`38273179853`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/38273179853) |
| `Submission gate` | **pass** | *"All 1 submitted entry passes: `dsh.bundle` declared, repo old enough, enough commits."* — run [`38274014820`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/38274014820) |
| Stale-fork guard | pass | `+1 / −0` entry files |
| Entry-file location / extension | pass | `data/plugins/*.yml`, one level deep |
| README consistency | pass | the PR does not touch the generated READMEs |

### Checks run locally before pushing

| Check | Result |
|---|---|
| Entry parses as YAML and matches the schema | pass — `url`/`name`/`category`/`description.en` all valid, `en` ends with a period |
| README regeneration | pass — produced exactly 2 added lines (one per locale) and **no other diff**, proving the fork was in sync with upstream |
| `npm ci` | pass |
| `npx awesome-lint` | **could not run locally** — fails identically on an unmodified checkout (*"Invalid GitHub repo URL"* on a Windows path), so this is an environment quirk, not the entry |
| `node scripts/build-site.mjs` | parsed **4,508 entries across 2 locales** (my entry included) then failed on `spawnSync cmd.exe EBUSY` — a sandbox restriction, unrelated to the entry |
| `scripts/check-submission.mjs` (the real gate) | its git diff is blocked by the same sandbox restriction, so it was run with `--only-list`, which targeted exactly 1 entry and reported **no failures**; the four gate conditions were then verified directly through the API: `dsh.bundle` present ✅, repo age 8.32 days ≥ 1 ✅, repo exists and is not archived ✅, not DSH itself ✅ |

The two local failures are sandbox artefacts and are stated as such rather than
counted as passes. CI ran both of them properly on the real PR and both passed.

---

## 4. Task 2 — announcement finalised

`docs/community/announcement.md` is now the **final, publishable** text: title,
a 134-word summary, the full post, the six-tool table, install, the two-minute
demo, links, compatibility and limitations, feedback, plus a ~55-word version for
length-limited channels.

It states, in the same breath as the positive claims, that **native resume is not
verified end to end on any provider**, that provider capability varies, and that
this is not format conversion between agents.

**Nothing was posted.** Not to Discord, not to GitHub Discussions, not anywhere.

---

## 5. Constraints honoured

| Constraint | Status |
|---|---|
| No change to released tags / Releases | ✅ v1.1.0 tags and Releases untouched; no tag created, moved or deleted |
| No npm / PyPI publish | ✅ |
| No new features | ✅ documentation and one list entry only |
| No large README changes | ✅ the README was not touched in this round |
| No exaggerating provider capability | ✅ the entry and the announcement both state native resume is unverified |
| No unauthorised PR to the DSH official repo | ✅ only the community list was contacted; the official repo does not accept external PRs anyway |

---

## 6. What a maintainer still has to do

The PR is **green but unreviewed**. Nothing else can move it:

1. A maintainer runs the review — the list's own rules say CI is the
   precondition, not the decision, and a human reads the repository before
   merging.
2. They merge. Only then does the entry appear in the list, and the READMEs
   regenerate on `main` by themselves.
3. If they comment, the fix is a one-line edit to the entry; a bounce over
   wording is normal and is not a rejection of the plugin.

**No action is required from us unless a review comment arrives.** Do not close
and reopen, do not force-push.

---

## 7. Next steps (all optional, none done)

1. **Watch the PR** for review comments and reply within the entry's scope.
2. **Publish the announcement** once — or after — the listing merges. Draft is
   ready.
3. **Record the demo GIF / screenshots** using `docs/demo/storyboard.md`; the
   five still assets need no model turn.
4. **Optionally attach a prebuilt `.tgz`** to the next Release and add the
   `tarball:` field, so the list can offer a no-build install. Recommended by the
   list, not required.
5. **Next version:** prove the extended release workflow on a real tag, and
   revisit the `^0.1.5-rc.3` peer-range prerelease caveat.

---

## Bottom line

The plugin was submitted to the community list on 2026-10-12. **The PR is open
and every check passes, but it is not merged, not listed and not featured.** The
listing exists only when a maintainer merges it.
