# @tzzs/dsh-git-workspace

> [English](README.md)

`@tzzs/dsh-git-workspace` 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Agent 的 Git / GitHub Coding Workflow Workspace 插件。它通过官方 `dsh.bundle`、profile 和 Cordis plugin 机制安装，不修改 DeepSeek Harness 本体。

插件以纯**只读**形态起步，正在逐步引入 mutation 能力：目前包含 22 个只读 Tool 和 12 个写 Tool。只读 Tool 始终保持无副作用，是插件的根基；每个写 Tool 都会在描述中声明自己的影响范围（以 `Write tool.` 开头），在触碰 Git/`gh` 之前校验全部参数，且只由明确的用户操作或 Agent 回合触发——绝不会由自动采样或刷新路径触发。破坏性操作设有门槛：hard reset 必须显式传入 `confirm:true` 才会执行，force-push 仅在被明确要求（`force:true`）时发生，绝不自动进行。

### 设计目标

- **Agent-first**：每个 Tool 都返回结构化、强类型数据，而不是原始 CLI stdout。
- **Bounded context**：diff、commit、log 都会做摘要与分页，避免污染 Agent context。
- **安全执行**：所有 Git / `gh` 命令都通过 `execFile(command, argv)` 执行，用户输入绝不拼接到 shell command。
- **影响范围纪律**：写 Tool 在描述中说明自己能破坏什么；hard reset 需要 `confirm:true` 确认；force-push 只能显式开启。
- **向后兼容**：原有六个 Tool 的名称、参数和返回结构保持不变。

### Tools

插件共提供 34 个 Agent Tools——22 个只读发现 Tool 加 12 个写 Tool，按类别组织。

#### Workspace

| Tool | 作用 |
| --- | --- |
| `git_workspace` | 聚合只读工作区上下文：仓库、分支、变更、对比、最近提交、PR 摘要、CI 摘要 |
| `git_status` | 返回 branch、upstream、ahead/behind 与工作区状态 |
| `git_files` | 按 scope 列出文件：`working-tree`、`staged`、`committed`、`all` |
| `git_diff` | 结构化、有界 diff，含文件元数据（added/deleted/renamed/copied/binary）与分页 hunks |

#### History

| Tool | 作用 |
| --- | --- |
| `git_commits` | 最近提交，支持 range（`base..head`）、author、path 过滤，含每个提交的文件摘要 |
| `git_show` | 单个 commit 的完整信息，支持 SHA / short SHA / revision（如 `HEAD`、`HEAD~1`） |
| `git_compare` | 比较两个 revision / branch，返回 ahead/behind、统计与文件列表 |
| `git_blame` | 追踪文件每一行的 commit 历史，支持行范围 |

#### Repository

| Tool | 作用 |
| --- | --- |
| `git_branches` | 本地与 remote branch，含 current、upstream、ahead、behind |
| `git_remotes` | remote 的 fetch/push URL 与解析后的 GitHub 元数据（支持 `origin` fork + `upstream`） |
| `git_worktrees` | 列出所有 worktree（只读） |
| `git_stash` | 列出 stash（只读） |
| `git_tags` | 列出 tag，含 commit 与 tagger 信息 |

#### 写操作（Git）

作用于本地仓库的 mutation Tool。每个 Tool 都返回结构化结果，绝不拼接 shell；非法输入（以 `-` 开头、NUL 字节）会在 Git 执行前被拒绝。

| Tool | 作用 |
| --- | --- |
| `git_stage` | 将工作区文件加入暂存区（`paths` 或 `all:true`） |
| `git_unstage` | 将文件移出暂存区，保留工作区改动（`paths` 或 `all:true`） |
| `git_commit` | 用已暂存的改动在当前分支创建提交（message 必填；可选 `amend`/`allowEmpty`） |
| `git_branch_create` | 从可选起点创建本地分支，默认同时切换过去 |
| `git_checkout` | 切换到另一个分支（或用 `create:true` 先创建）；会覆盖本地未提交改动时拒绝执行 |
| `git_merge` | 将其他分支合并进当前分支；冲突时返回 `conflictedFiles`，绝不自动解决冲突 |
| `git_push` | 将分支推送到 remote（默认设置 upstream）；`force:true` 会改写远端历史，且绝不会被自动触发 |
| `git_reset` | 移动当前分支（`soft`/`mixed`/`hard`）；`hard` 会丢弃所有未提交改动，必须显式传入 `confirm:true` |

#### 写操作（GitHub）

通过 `gh` CLI 作用于 GitHub 的 mutation Tool。需要已登录的 `gh`，只修改参数明确指出的对象。

| Tool | 作用 |
| --- | --- |
| `github_pr_create` | 通过 `gh pr create` 为分支创建 PR；title/body 未同时给出时会从提交历史自动填充 |
| `github_pr_merge` | 合并 PR（`merge`/`squash`/`rebase`），可选删除源分支——对远端不可逆 |
| `github_pr_comment` | 在 PR 上发表评论 |
| `github_pr_review` | 提交 review（`APPROVE`、`REQUEST_CHANGES` 或 `COMMENT`；request changes 需要附 body） |

#### GitHub

| Tool | 作用 |
| --- | --- |
| `github_pr` | 当前分支对应的所有 PR，含完整元数据、统计、review decision 与 mergeable |
| `github_pr_diff` | 指定 PR 的结构化、有界 diff |
| `github_pr_reviews` | PR 上的 reviews（`APPROVED`、`CHANGES_REQUESTED`、`COMMENTED`、`PENDING`） |
| `github_pr_comments` | conversation 与 inline review comments，含 review thread 的 `resolved` 状态 |
| `github_ci` | PR 或当前 branch / commit 的 CI / check 状态 |
| `github_ci_logs` | 指定 run（可选 job）的分页 CI 日志 |
| `github_issue` | 按编号读取 GitHub issue |
| `github_issue_comments` | 读取 issue 的对话评论 |
| `github_releases` | GitHub releases，含 tag、日期与 URL |

## Git Workspace UI

> 详见 [docs/ui.md](docs/ui.md)（UI 架构）与 [docs/dsh-ui-api.md](docs/dsh-ui-api.md)（DSH Web UI 扩展 API）。

该插件还附带一个浏览器端，将后端 Tool 转换为 DeepSeek Harness Web UI 中
紧凑、持续存在的 **Git Workspace**。

### 功能

- **紧凑 Tool 卡片** — Agent 每次调用 `git_*` / `github_*` 都会在对话中渲染为
  Git Workspace 卡片（branch、ahead/behind、changes、commits、PR、CI），
  而不是原始 JSON。
- **持续存在的 Git Workspace 面板** — 会话标题栏操作区中的按钮（“Git
  Workspace”）打开一个浮动面板，展示当前 workspace 概览：当前 branch、
  upstream、按状态分组的 changes、commits、PR 与 CI checks。
- **共享上下文** — Agent 与 UI 消费同一套 `git_*` Tool，看到的是同一份 Git
  状态，没有独立的前端数据管道。

### 启用方式

当包声明了 `dsh.client` 与 `exports["./client"]` 时，web profile 会自动加载
浏览器端。请在**同一个** `DSH_HOME` 下安装并运行 web profile。当 `DSH_HOME`
未设置时，`dsh` CLI 会静默使用 `~/.dsh`，因此在其他 home 下安装的 profile
启动时不会带上 client bundle（boot manifest 里根本没有 `@tzzs` entry ——
没有报错，也没有 UI）：

```bash
export DSH_HOME="$HOME/.dsh-git-workspace"
dsh plugin --profile web add ./path/to/dsh-git-workspace
dsh --profile web
```

打开浏览器前先确认 client 已进入 boot manifest：

```bash
curl -s http://127.0.0.1:PORT/ | grep -o '"id":"@tzzs[^}]*}'
# "id":"@tzzs/dsh-git-workspace","url":"/plugins/@tzzs/dsh-git-workspace/client.js?rev=..."
```

### 只读优先，写控件显式触发

UI 与后端同步演进。它依旧支持 inspect、search、diff、browse、open、refresh，
现在还提供接入新写 Tool 的操作控件：逐文件 Stage/Unstage 按钮、Stage All /
Unstage All、提交框（commit、push、分支操作）、PR 合并控件（合并方式选择 +
删除源分支勾选框）、Approve / Request changes 审阅按钮，以及评论输入框。
UI 无法直接调用 Tool——每个控件只会发出一条排队的 Agent 回合，其文本明确指定
要运行的 `git_*`/`github_*` 写 Tool 与参数，因此任何变更都必须经过用户发起的
模型可见回合。自动采样与刷新路径绝不触发写操作。详见 [docs/ui.md](docs/ui.md)。

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

`github_*` Tool 依赖本地 `gh` CLI，不实现 OAuth 或 GitHub API authentication：

```bash
gh auth login
gh auth status
```

没有安装或没有登录时，Tool 返回结构化错误：

- `GH_NOT_INSTALLED`
- `GH_NOT_AUTHENTICATED`
- `NO_GITHUB_REMOTE`
- `NOT_GITHUB_REPOSITORY`
- `GITHUB_QUERY_FAILED`
- `GITHUB_RESOURCE_NOT_FOUND`
- `GITHUB_PERMISSION_DENIED`

### Tool 参数

```ts
git_workspace()

git_status()

git_files({ scope: "working-tree" | "staged" | "committed" | "all" })

git_diff({ path?, staged?, base?, head?, offset?, limit? })

git_commits({ limit?, path?, base?, head?, from?, to?, author? })

git_show({ sha?, includeDiff?, includeFiles?, offset?, limit? })

git_compare({ base?, head?, path?, offset?, limit? })

git_blame({ path, startLine?, endLine?, revision?, limit? })

git_branches()

git_remotes()

git_worktrees()

git_stash()

git_tags()

git_stage({ paths?, all? })

git_unstage({ paths?, all? })

git_commit({ message, amend?, allowEmpty? })

git_branch_create({ name, startPoint?, checkout? })

git_push({ remote?, branch?, force?, setUpstream? })

git_checkout({ branch, create? })

git_merge({ branch, message?, squash?, noFastForward? })

git_reset({ mode?, ref?, confirm? })

github_pr()

github_pr_create({ title?, body?, base?, head?, draft? })

github_pr_merge({ number, method?, deleteBranch?, subject?, body? })

github_pr_comment({ number, body })

github_pr_review({ number, state?, body? })

github_pr_diff({ number, path?, offset?, limit? })

github_pr_reviews({ number })

github_pr_comments({ number })

github_ci({ number?, branch? })

github_ci_logs({ runId, jobId?, offset?, limit? })

github_issue({ number })

github_issue_comments({ number })

github_releases({ limit? })
```

### 返回值示例

`git_workspace` 返回聚合摘要：

```json
{
  "repository": {
    "root": "/workspace/project",
    "name": "project",
    "remote": "git@github.com:owner/project.git",
    "github": { "host": "github.com", "owner": "owner", "name": "project" }
  },
  "branch": { "name": "feature/x", "upstream": "origin/feature/x", "ahead": 2, "behind": 0 },
  "changes": { "modified": 2, "staged": 1, "deleted": 0, "renamed": 0, "untracked": 3 },
  "workspace": { "clean": false, "modified": 2, "staged": 1, "deleted": 0, "renamed": 0, "untracked": 3 },
  "comparison": { "base": "main", "ahead": 3, "behind": 0 },
  "commits": { "ahead": 3, "recent": [{ "sha": "...", "shortSha": "...", "message": "...", "author": "...", "date": "..." }] },
  "pullRequest": { "number": 3, "title": "...", "state": "OPEN", "draft": false, "url": "..." },
  "ci": { "status": "success", "checks": [{ "name": "test", "status": "completed", "conclusion": "success" }] }
}
```

`github_pr` 返回 `pullRequests[]`（同一 branch 可能对应多个 PR），含完整元数据：

```json
{
  "repository": { "owner": "owner", "name": "project" },
  "branch": "feature/x",
  "pullRequests": [{
    "number": 3,
    "title": "feat: ...",
    "body": "...",
    "state": "OPEN",
    "draft": false,
    "author": "alice",
    "base": "main",
    "head": "feature/x",
    "url": "https://github.com/owner/project/pull/3",
    "createdAt": "...",
    "updatedAt": "...",
    "stats": { "files": 4, "additions": 120, "deletions": 40 },
    "reviewDecision": "APPROVED",
    "mergeable": "MERGEABLE",
    "merged": false
  }]
}
```

### 错误处理

所有 Tool 都返回统一的 `Result`。成功返回数据结构；失败返回：

```json
{
  "error": { "code": "...", "message": "...", "hint": "..." }
}
```

稳定的错误码：

- Git：`NOT_A_GIT_REPOSITORY`、`GIT_COMMAND_FAILED`、`INVALID_GIT_ARGUMENT`、`INVALID_PATH`、`REVISION_NOT_FOUND`
- GitHub：`NO_GITHUB_REMOTE`、`NOT_GITHUB_REPOSITORY`、`GH_NOT_INSTALLED`、`GH_NOT_AUTHENTICATED`、`GITHUB_QUERY_FAILED`、`GITHUB_RESOURCE_NOT_FOUND`、`GITHUB_PERMISSION_DENIED`
- 写 Tool：`NOTHING_TO_COMMIT`、`BRANCH_ALREADY_EXISTS`、`BRANCH_NOT_FOUND`、`DIRTY_WORKTREE`、`HARD_RESET_REQUIRES_CONFIRM`、`GIT_PUSH_REJECTED`、`GITHUB_PR_NOT_MERGEABLE`

不会把底层异常堆栈直接暴露给 Agent。

### 安全性

- 所有 Git 与 `gh` 命令都通过 `execFile(command, argv)` 执行。
- 用户输入绝不拼接进 shell command。
- revision、path、branch、commit、PR number、issue number、query 都会做校验：拒绝 NUL 字节，revision/path/branch/remote 拒绝以 `-` 开头的参数。
- path 一律放在 `--` 之后（例如 `git diff revision -- path`）。
- 不存在万能的 `git_execute` / `github_execute` Tool。
- diff、commit、blame、CI log 结果默认做 bound 与分页。
- 破坏性操作设有门槛：`git_reset` 的 `hard` 模式必须显式传入 `confirm:true` 才会执行；只有调用方明确传入 `force:true` 时才会改写远端历史。
- 写 Tool 只由明确的用户操作或 Agent 回合触发——绝不由自动采样或刷新路径触发。

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
make integration   # 或:make agent-loop
```

该脚本使用 Harness 的真实 Agent Loop、ToolRuntime 和脚本化 LLM adapter，验证 34 个 Tool 的发现、调用和结果返回，不需要真实 LLM 账号。前提是全局安装了 `@deepseek-ai/dsh`(`npm i -g @deepseek-ai/dsh`);脚本会在运行时自动解析包位置，也可以通过 `DSH_GLOBAL_ROOT` 显式指定。测试导入的是编译产物 `lib/`,请始终通过 `npm test` / `make test` 运行测试——直接跑 `node --test` 时,`tests/lib-fresh.test.js` 的守卫会在 `lib/` 过期或缺失时立即报错并给出明确提示。

### 官方 profile 验证

```bash
dsh plugin --profile test add ./path/to/dsh-git-workspace
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

- ✅ Git Workspace UI（只读）：紧凑 Tool 卡片 + 持续存在的 workspace 面板
- ✅ 第二阶段 mutation Tool：`git_branch_create`、`git_stage`、`git_unstage`、`git_commit`、`git_push`、`git_checkout`、`git_merge`、`git_reset`、`github_pr_create`、`github_pr_merge`、`github_pr_comment`、`github_pr_review`
- ✅ 写控件接入 Git Workspace 面板：逐文件 stage/unstage、提交框与 Git 操作菜单、PR 合并方式选择 + 删除源分支勾选框、Approve/Request changes 按钮、评论输入框
- 后续：更多高风险操作（如 `github_pr_close`）沿用同一套影响范围规则——描述声明能破坏什么、只由显式用户/Agent 触发

---
