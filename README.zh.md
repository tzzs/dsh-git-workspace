# @tzzs/dsh-git-workspace

> [English](README.md)

`@tzzs/dsh-git-workspace` 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Agent 的只读 Git / GitHub Workspace 插件。它通过官方 `dsh.bundle`、profile 和 Cordis plugin 机制安装，不修改 DeepSeek Harness 本体。

### 功能

插件提供以下六个 Agent Tools：

| Tool | 作用 |
| --- | --- |
| `git_workspace` | 一次返回仓库、分支、变更统计、最近提交和当前分支 PR 摘要 |
| `git_status` | 返回 branch、upstream、ahead/behind 以及结构化工作区状态 |
| `git_files` | 列出工作区、staged、committed 或全部文件 |
| `git_diff` | 返回结构化 diff、文件统计和 hunks，支持分页及 staged/base/head |
| `git_commits` | 返回最近提交，可按路径过滤，默认最多 20 条，最多 100 条 |
| `github_pr` | 使用 GitHub CLI 查询当前分支对应的全部 Pull Requests |

第一版是只读插件，不执行 commit、push、checkout、stage、merge、PR 修改或代码自动修改。

### 安装

安装已发布的 npm 包：

```bash
dsh plugin --profile default add @tzzs/dsh-git-workspace
dsh --profile default
```

本地开发包：

```bash
dsh plugin --profile dev add ./path/to/dsh-git-workspace
dsh --profile dev
```

插件包声明了官方 bundle：

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

### GitHub CLI 配置

`github_pr` 依赖本地 `gh` CLI，不实现 OAuth 或 GitHub API authentication：

```bash
gh auth login
gh auth status
```

没有安装或没有登录时，Tool 会返回结构化错误：

- `GH_NOT_INSTALLED`
- `GH_NOT_AUTHENTICATED`
- `NO_GITHUB_REMOTE`
- `NOT_GITHUB_REPOSITORY`
- `GITHUB_QUERY_FAILED`

### Tool 参数

```ts
git_workspace()
git_status()
git_files({
  scope: "working-tree" | "staged" | "committed" | "all"
})
git_diff({
  path?: string,
  staged?: boolean,
  base?: string,
  head?: string,
  offset?: number,
  limit?: number
})
git_commits({
  limit?: number,
  path?: string
})
github_pr()
```

示例：

```json
{"path":"src/index.ts","limit":300}
```

```json
{"staged":true}
```

```json
{"base":"HEAD~3","head":"HEAD"}
```

### 返回值示例

`git_status`：

```json
{
  "branch": {
    "name": "feature/git-plugin",
    "upstream": "origin/feature/git-plugin",
    "ahead": 2,
    "behind": 0
  },
  "files": [
    {"path":"src/index.ts","status":"modified","staged":false},
    {"path":"src/new.ts","status":"untracked","staged":false}
  ]
}
```

`git_diff` 返回结构化文件和 hunks：

```json
{
  "files": [{
    "path": "src/index.ts",
    "oldPath": null,
    "status": "modified",
    "additions": 3,
    "deletions": 1,
    "hunks": [{
      "oldStart": 10,
      "oldLines": 4,
      "newStart": 10,
      "newLines": 6,
      "lines": [" context", "-old", "+new"]
    }]
  }],
  "raw": "..."
}
```

`github_pr` 返回 `pullRequests[]`，因为同一 branch 可能对应多个 PR：

```json
{
  "repository": {"owner":"tzzs","name":"dsh-git-workspace"},
  "branch": "feature/git-plugin",
  "pullRequests": [{
    "number": 3,
    "title": "feat: add git workspace",
    "state": "OPEN",
    "draft": false,
    "base": "main",
    "head": "feature/git-plugin",
    "url": "https://github.com/.../pull/3"
  }]
}
```

### 安全性

- 所有 Git 和 `gh` 命令都通过 `execFile(command, argv)` 执行。
- 用户输入不会拼接进 shell command。
- path、base、head 等参数不会突破 Git 参数边界。
- 所有 Git Tools 都能处理非 Git repository，并返回结构化错误。
- 默认限制 diff 和 commit 数量，避免污染 Agent context。
- 插件不执行破坏性 Git 操作。

### 开发

环境要求：Node.js、npm，以及用于 Harness profile 管理的 `pnpm` 或 `corepack`。

```bash
npm install
npm run build
npm test
npm run check
```

也可以使用 Makefile：

```bash
make install
make build
make test
make check
```

构建产物位于 `lib/`，本地验证 Agent Loop：

```bash
npm run build
node scripts/agent-loop-integration.mjs
```

该脚本使用 Harness 的真实 Agent Loop、ToolRuntime 和脚本化 LLM adapter，验证六个 Tool 的发现、调用和结果返回，不需要真实 LLM 账号。

### 官方 profile 验证

```bash
# 本地包安装到 test profile
dsh plugin --profile test add ./path/to/dsh-git-workspace

# 无交互地检查 bundle composition
dsh --profile test --dump-config
```

预期 composition 中包含：

```yaml
- id: dsh-git-workspace
  name: '@tzzs/dsh-git-workspace'
```

### 发布

`prepack` 会自动构建 TypeScript：

```bash
npm pack
npm publish --access public
```

发布前建议执行：

```bash
make check
make pack
```

### Roadmap

- Git Diff Viewer UI
- PR review 和 comments
- CI 状态
- 更丰富的 committed 文件元数据
- PR 与 commit 关联视图

---

