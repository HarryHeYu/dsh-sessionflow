# Publication targets — verified 2026-10-12

Every channel below was checked against its own source on **2026-10-12**; the
"how it was verified" column says exactly what was read. Nothing here is
inferred from a search-result snippet.

**Status:** the curated-list PR has been **submitted** (see
[Status of each step](#status-of-each-step)); nothing else has been posted,
emailed or submitted, and no listing exists until a maintainer merges it.

---

## Channel 1 — the official discovery mechanism (authoritative)

**Source:** `deepseek-ai/deepseek-harness` → `CONTRIBUTING.md`
(https://github.com/deepseek-ai/deepseek-harness/blob/main/CONTRIBUTING.md)

> DeepSeek Harness is still at an early stage and under active development. We are
> sorry that we cannot accept external pull requests at the moment. …
> - Contribute to the ecosystem:
>   - Create a plugin that excites you and share it with others:
>     - Associate your GitHub project with the `dsh-plugin` topic to help others
>       discover your plugin.

| | |
|---|---|
| Entry point | Add the GitHub topic **`dsh-plugin`** to the repository |
| Format | none — a repository topic |
| Review | none |
| Cost / limits | free, no permission needed |
| Status for us | **ALREADY DONE** — `dsh-sessionflow` carries `dsh-plugin` (checked via the GitHub API on 2026-10-12) |
| How it was verified | read `CONTRIBUTING.md` from the official repo; read `topics` from `GET /repos/HarryHeYu/dsh-sessionflow` |

Two things this tells us that matter:

1. **Do not open a PR against the official repo.** It states plainly that external
   PRs are not accepted. Any attempt would be ignored, not reviewed.
2. The topic is the *official* distribution channel. `topic:dsh-plugin` matches
   **18,879 repositories** (GitHub search API, 2026-10-12), and the official repo
   itself carries the topic — so it is the mechanism the project actually points
   at.

**Issues and bug reports** for DSH itself go to the official repo's **GitHub
Discussions** (same CONTRIBUTING.md). That is for DSH problems, not for
announcing a plugin.

---

## Channel 2 — the curated community list

**Source:** `awesome-dsh-plugin/awesome-dsh-plugin`
(https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — 18,496 stars, 1,000
plugin entries as of 2026-10-12. Contribution rules read from `contributing.md`.

| | |
|---|---|
| Entry point | Open a PR that adds **one file**: `data/plugins/<owner>__<repo>.yml` |
| Format | YAML: `url`, `name`, `category`, `description.en` (optional `zh`); optional `tarball` |
| Review | automated CI (manifest, repo age, formatting, README regeneration) **then a maintainer reads the repo** |
| Cost / limits | free; one file per plugin; do not hand-edit the generated READMEs |
| Permission needed | no — but a maintainer reads the code before merging |
| How it was verified | read `contributing.md` and the `data/plugins/` directory listing via the GitHub API |

### Our entry (draft, not submitted)

```yaml
# data/plugins/HarryHeYu__dsh-sessionflow.yml
url: https://github.com/HarryHeYu/dsh-sessionflow
name: HarryHeYu/dsh-sessionflow
category: session
description:
  en: Continue work from Codex, Claude Code and other agents inside DeepSeek Harness through six sessionFlow tools over a local cross-agent session index.
```

`category: session` is the closest match — the plugin's whole job is session
continuity. The list also offers `memory`, `workflow` and `tools`; `session` is
the specific one.

### Compliance check against the stated requirements

| Requirement | Ours | Evidence |
|---|---|---|
| `dsh.bundle` declared in `package.json` | ✅ | `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` |
| `cordis.patch.yml` present at the root | ✅ | shipped in the repo and in the tag tree |
| Real, working code (not a placeholder) | ✅ | 40 passing tests, real bridge, real installs verified in CI |
| Repository at least 1 day old | ✅ | first commit 2026-10-04; checked 2026-10-12 |
| `dsh-plugin` topic added | ✅ | present in `topics` |
| Description accurate, no marketing | ✅ | description names only what the code does |
| Not a meta-package (ships behaviour) | ✅ | it is a tool adapter, not a dependency list |
| `@deepseek-ai/*` declared as `peerDependencies` | ✅ | `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools` are peers, not deps |

**One recommended-but-optional item we do not yet satisfy:** attaching a
**prebuilt tarball** to the GitHub Release and pointing at it with a `tarball:`
field. The list offers it so users skip the `allowBuilds` step. It is optional
today; it becomes *required* only if a repo cannot be installed from source at
all, which is not our case. Our `file:` and `github:` installs are verified on
Linux CI on every push.

> ⚠️ **Latent packaging risk worth knowing about.** The same document warns that a
> peer range without an explicit prerelease branch silently excludes prerelease
> builds of the harness. Our range is `^0.1.5-rc.3`, which does match the tested
> `0.1.5-rc.3`, but node-semver only lets a prerelease satisfy a range when a
> comparator shares its exact `major.minor.patch` tuple — so a future
> `0.1.6-rc.*` could fail to resolve. This is **not** changed here: the current
> range matches the version we test against, and changing a peer range without
> being able to test against a real DSH prerelease would be a guess, not a fix.
> Track it for the next release.

---

## Channel 3 — auto-indexing third-party registries

Several sites index the `dsh-plugin` topic automatically. They are **independent
community sites, not DeepSeek properties**, and none of them is an official
channel. Because they read the topic, **they need no submission from us** — our
repository already qualifies.

| Site | What it is | Submission needed | How it was verified |
|---|---|---|---|
| `dshplugin.org` | independent community registry | no — "add the `dsh-plugin` topic so the community can find it in the next index refresh" | read the site; it links its own source repo `oa1mgo/dshplugin` |
| `dsh.pub`, `plugin.dshdesk.com`, `dshplugin.app`, `dshplugins.org` | independent catalogues that advertise themselves as indexing the public `dsh-plugin` ecosystem | no documented submission process found | seen in search results; **not** verified as official, and not recommended as a primary channel |

**Recommendation:** treat these as passive reach, not as channels to work. Do not
pay, do not sign up, and do not treat a listing there as endorsement. If one of
them asks for anything beyond the public topic, ignore it.

---

## What we will *not* do

- **Not** open a PR against `deepseek-ai/deepseek-harness` — it does not accept
  external PRs.
- **Not** publish to npm or PyPI as part of a community announcement.
- **Not** post to any forum, Discord, or social channel without explicit approval.
- **Not** present the plugin as endorsed, official, or affiliated.
- **Not** claim native resume works, or that provider capabilities are uniform.

---

## Status of each step

1. **Official channel — the `dsh-plugin` topic.** **DONE** (it was already set;
   nothing to submit, and the official repo does not accept external PRs).
2. **Curated list — the one-file PR.** **SUBMITTED on 2026-10-12.**
   - PR: https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7226
   - Branch: `HarryHeYu:add-dsh-sessionflow` (fork), base `main` @ `4726e1de`
   - Commit: `9c9dc728a3dc33c63d0f9fd2744d8705eedaf8a8`
   - File: `data/plugins/HarryHeYu__dsh-sessionflow.yml` (+6 / −0, nothing else)
   - CI: `check` **pass** (7m1s) and `Submission gate` **pass** — the gate's own
     verdict was *"All 1 submitted entry passes: `dsh.bundle` declared, repo old
     enough, enough commits."*
   - State: **OPEN**, `MERGEABLE`, `CLEAN`, no review yet.
   - **A submitted PR is not a listing.** Nothing appears in the list until a
     maintainer merges it, and a maintainer reads the repository before merging.
3. **Optional — a prebuilt tarball** on the next Release, so the list can offer a
   no-build install. Not done; the list treats this as recommended, not required.
4. **The written announcement** is final and unposted — see
   [`announcement.md`](announcement.md). Publishing anywhere is still your call.

Nothing was posted to any forum, Discord or GitHub Discussions.

