你现在需要开发一个可以安装到 DeepSeek Harness 的第三方插件：

@tzzs/dsh-git-workspace

GitHub 仓库：
https://github.com/deepseek-ai/deepseek-harness

项目目标：
为 DeepSeek Harness Agent 提供一个 Git / GitHub Workspace 插件，让 Agent 能够方便地查看当前 Git 工作区、修改文件、Git Diff、提交记录、当前分支以及当前分支对应的 GitHub Pull Request。

==============================
一、必须先研究 DeepSeek Harness
==============================

不要根据猜测实现。

开始开发前，必须先阅读当前 deepseek-harness master 分支的源码和官方插件文档，重点研究：

1. packages/extensions/
2. packages/extensions/tool-cordis/
3. docs/user/develop/basic/publish.md
4. docs/user/develop/basic/config.md
5. docs/user/develop/framework/
6. packages/bundle/
7. packages/boot/
8. apps/cli/
9. 当前 profile / bundle / plugin loader 实现
10. 当前 Tool 注册机制
11. 当前 shell / bash / command service
12. 当前 UI / browser plugin / extension 机制（如果实现 UI）

特别注意：

当前 DeepSeek Harness 已经采用：

npm package
    ↓
dsh.bundle
    ↓
cordis.patch.yml
    ↓
profile
    ↓
plugin

作为第三方插件安装机制。

官方插件安装方式类似：

dsh plugin --profile default add <package>

不要修改 deepseek-harness 本体来实现本项目。

不要自己设计一个与官方机制冲突的 plugin loader。

必须使用当前版本真实存在的 API。

如果源码与旧文档存在差异，以当前 master 源码为准。

当前仓库版本重点参考：
@deepseek-ai/dsh-root 0.1.0-rc.5

但不要硬编码版本号，实际依赖版本应根据当前仓库 package.json / lockfile / workspace 配置确定。

==============================
二、项目定位
==============================

项目名称：

@tzzs/dsh-git-workspace

项目定位：

DeepSeek Harness 的 Git / GitHub Workspace Plugin。

不是简单的 Git CLI wrapper。

它应该为 Agent 提供结构化的 Git Workspace 信息，并为未来的 Git Diff Viewer、PR Review、PR Comments、CI 状态等能力留下扩展空间。

第一阶段重点：

1. 当前 Git 分支
2. 当前工作区状态
3. 修改的文件
4. staged 文件
5. untracked 文件
6. Git diff
7. commit 历史
8. 当前分支对应的 GitHub PR

==============================
三、第一阶段必须实现的 Tools
==============================

至少实现以下 6 个 Agent Tools：

1. git_workspace
2. git_status
3. git_files
4. git_diff
5. git_commits
6. github_pr

==============================
四、git_workspace
==============================

这是聚合 Tool。

用途：

让 Agent 在进入一个 Git repository 后，可以用一次调用快速了解整个工作区。

不要在这个 Tool 中返回完整 diff。

不要返回大量文件内容。

只返回 summary。

建议结构：

{
  "repository": {
    "root": "/workspace/project",
    "name": "project",
    "remote": "origin"
  },

  "branch": {
    "name": "feature/git-plugin",
    "upstream": "origin/feature/git-plugin",
    "ahead": 2,
    "behind": 0
  },

  "changes": {
    "modified": 5,
    "staged": 2,
    "deleted": 0,
    "renamed": 0,
    "untracked": 1
  },

  "commits": {
    "ahead": 2
  },

  "pullRequest": {
    "number": 3,
    "title": "feat: add git workspace",
    "state": "OPEN",
    "draft": false,
    "url": "https://github.com/..."
  }
}

如果当前目录不是 Git repository，应返回结构化错误，而不是让插件崩溃。

如果没有 GitHub remote：

pullRequest = null

如果当前分支没有 PR：

pullRequest = null

==============================
五、git_status
==============================

实现当前 Git 工作区状态。

优先使用：

git status --porcelain=v2 --branch

而不是依赖普通的：

git status --short

原因：

porcelain=v2 更适合机器解析。

必须正确处理：

- modified
- added
- deleted
- renamed
- copied
- staged
- unstaged
- untracked
- branch
- upstream
- ahead
- behind

返回结构化数据，例如：

{
  "branch": {
    "name": "feature/test",
    "upstream": "origin/feature/test",
    "ahead": 2,
    "behind": 0
  },

  "files": [
    {
      "path": "src/index.ts",
      "status": "modified",
      "staged": false
    }
  ]
}

==============================
六、git_files
==============================

用于列出文件。

必须支持 scope：

- working-tree
- staged
- committed
- all

建议：

git_files({
  scope: "working-tree"
})

返回：

{
  "files": [
    {
      "path": "src/index.ts",
      "status": "modified",
      "staged": false
    },
    {
      "path": "src/git.ts",
      "status": "modified",
      "staged": true
    },
    {
      "path": "src/ui/GitDiff.tsx",
      "status": "untracked",
      "staged": false
    }
  ]
}

必须正确处理：

- added
- modified
- deleted
- renamed
- copied
- untracked

不要通过字符串拼接 shell command。

文件路径必须作为 argv 参数传递。

==============================
七、git_diff
==============================

这是整个插件最重要的 Tool。

必须支持：

git_diff()

git_diff({
  path: "src/git.ts"
})

git_diff({
  staged: true
})

git_diff({
  base: "HEAD~3",
  head: "HEAD"
})

建议 API：

{
  path?: string,
  staged?: boolean,
  base?: string,
  head?: string
}

必要时支持：

offset
limit

避免一次把巨大 diff 全部塞进 Agent context。

例如：

git_diff({
  path: "src/large-file.ts",
  offset: 0,
  limit: 300
})

==============================
八、git_diff 返回结构
==============================

不要简单返回：

git diff

的原始字符串。

应该尽可能解析成结构化结果。

建议：

{
  "files": [
    {
      "path": "src/git.ts",
      "oldPath": null,

      "status": "modified",

      "additions": 32,
      "deletions": 8,

      "hunks": [
        {
          "oldStart": 10,
          "oldLines": 5,

          "newStart": 10,
          "newLines": 29,

          "lines": [
            " context",
            "- old code",
            "+ new code"
          ]
        }
      ]
    }
  ]
}

支持：

- added
- modified
- deleted
- renamed

为未来 UI Diff Viewer 做准备。

如果完整 diff 无法可靠解析，可以保留 raw diff 作为 fallback，但优先提供结构化信息。

==============================
九、git_commits
==============================

用于查看 commit 历史。

支持：

git_commits()

git_commits({
  limit: 20
})

git_commits({
  path: "src/git.ts"
})

建议返回：

{
  "commits": [
    {
      "sha": "a83f91d...",
      "shortSha": "a83f91d",
      "message": "feat: add git workspace",
      "author": "Zheng",
      "date": "2026-08-15T10:20:00Z"
    }
  ]
}

可以额外提供：

files

例如：

{
  "sha": "...",
  "message": "...",
  "files": [
    "src/git.ts",
    "src/index.ts"
  ]
}

底层优先使用：

git log

必要时使用：

git show

不要一次读取整个 Git history。

==============================
十、github_pr
==============================

这个 Tool 用于获取当前 Git branch 对应的 GitHub Pull Request。

不要自己实现 GitHub OAuth。

第一阶段优先使用 GitHub CLI：

gh

流程：

1. 获取当前 branch：

git branch --show-current

2. 获取 Git remote：

git remote get-url origin

3. 解析：

owner/repository

4. 根据当前 branch 查询 PR：

gh pr list --head <branch>

5. 返回结构化结果。

建议：

{
  "repository": {
    "owner": "tzzs",
    "name": "skillbox"
  },

  "branch": "feature/git-plugin",

  "pullRequests": [
    {
      "number": 3,
      "title": "feat: add git workspace",
      "state": "OPEN",
      "draft": false,
      "base": "main",
      "head": "feature/git-plugin",
      "url": "https://github.com/tzzs/skillbox/pull/3"
    }
  ]
}

注意：

不要假设一个 branch 永远只有一个 PR。

因此返回：

pullRequests[]

而不是单个 pullRequest。

没有 PR：

[]

没有 GitHub remote：

[]

没有 gh：

返回明确、可操作的错误信息。

例如：

GitHub CLI (gh) is not installed.

或者：

GitHub CLI is not authenticated. Run `gh auth login`.

不要让整个 Harness 崩溃。

==============================
十一、Git / gh 命令执行安全
==============================

这是非常重要的要求。

禁止：

exec(`git diff ${userInput}`)

禁止：

exec(`gh pr view ${userInput}`)

禁止把用户输入拼接成 shell command。

必须使用当前 DeepSeek Harness 提供的 shell / command service。

参数应该作为 argv 传入：

command = "git"
args = ["diff", "--", path]

而不是：

command = `git diff ${path}`

所有用户可控参数必须经过安全处理。

尤其注意：

- path
- branch
- commit SHA
- base
- head

不要允许这些参数突破 Git command 的参数边界。

==============================
十二、Git Repository 检测
==============================

所有 Git Tools 都应该能够判断：

当前 cwd 是否是 Git repository。

优先使用：

git rev-parse --show-toplevel

获取 repository root。

不要依赖当前 shell 的 pwd。

如果当前不是 Git repository：

返回结构化错误。

例如：

{
  "error": {
    "code": "NOT_A_GIT_REPOSITORY",
    "message": "Current directory is not a Git repository."
  }
}

不要抛出未经处理的 child_process exception。

==============================
十三、Git remote 解析
==============================

必须兼容：

https://github.com/owner/repo.git

git@github.com:owner/repo.git

ssh://git@github.com/owner/repo.git

GitHub Enterprise 的可能形式也尽量设计成可扩展。

remote parser 不应该只支持一种 URL。

建议独立实现：

parseGitRemote()

返回：

{
  host: "github.com",
  owner: "tzzs",
  repository: "skillbox"
}

==============================
十四、GitHub CLI
==============================

第一版不要自己实现 GitHub API authentication。

优先：

gh pr list

gh pr view

gh auth status

如果 gh 不存在：

返回：

GH_NOT_INSTALLED

如果没有认证：

返回：

GH_NOT_AUTHENTICATED

如果当前 repository 不是 GitHub：

返回：

NOT_GITHUB_REPOSITORY

所有错误必须是结构化错误。

==============================
十五、插件结构
==============================

建议：

dsh-git-workspace/
│
├── package.json
├── cordis.patch.yml
├── README.md
├── LICENSE
│
├── src/
│   ├── index.ts
│   ├── types.ts
│   │
│   ├── git/
│   │   ├── repository.ts
│   │   ├── status.ts
│   │   ├── files.ts
│   │   ├── diff.ts
│   │   └── commits.ts
│   │
│   ├── github/
│   │   └── pr.ts
│   │
│   └── tools/
│       ├── git-workspace.ts
│       ├── git-status.ts
│       ├── git-files.ts
│       ├── git-diff.ts
│       ├── git-commits.ts
│       └── github-pr.ts
│
└── tests/
    ├── repository.test.ts
    ├── status.test.ts
    ├── files.test.ts
    ├── diff.test.ts
    ├── commits.test.ts
    └── github-pr.test.ts

可以根据 DeepSeek Harness 当前实际 API 调整目录结构。

不要为了严格遵守上述目录而破坏当前项目的最佳实践。

==============================
十六、Bundle
==============================

必须使用 DeepSeek Harness 当前的 bundle 机制。

package.json 必须声明：

"dsh": {
  "bundle": {
    "patch": "./cordis.patch.yml"
  }
}

cordis.patch.yml 负责把插件插入 composition。

不要修改 deepseek-harness 主仓库。

不要要求用户 fork DeepSeek Harness。

不要要求用户修改 node_modules。

==============================
十七、发布方式
==============================

第一阶段优先支持：

npm package

例如：

@tzzs/dsh-git-workspace

安装：

dsh plugin --profile default add @tzzs/dsh-git-workspace

然后：

dsh --profile default

README 必须提供完整安装流程。

同时提供本地开发安装：

dsh plugin --profile dev add ./path/to/dsh-git-workspace

如果当前 Harness 对本地 bundle 有特殊要求，以当前源码和官方文档为准。

==============================
十八、不要第一阶段做 UI
==============================

第一阶段不要花大量时间实现 UI。

先完成：

- Plugin loading
- Bundle installation
- Tool registration
- Git operations
- GitHub PR
- Error handling
- Tests

确保 Agent 可以正常调用：

git_workspace
git_status
git_files
git_diff
git_commits
github_pr

UI 作为第二阶段。

但是 Tool 返回的数据结构必须为未来 UI Diff Viewer 设计。

==============================
十九、未来 UI 设计
==============================

为第二阶段保留：

Git Workspace UI

结构：

Git Workspace
├── Repository
├── Branch
├── Ahead / Behind
├── Pull Request
├── Changed Files
├── Staged Files
├── Untracked Files
├── Commits
└── Diff Viewer

示意：

┌──────────────────────────────────────┐
│ Git Workspace                        │
├──────────────────────────────────────┤
│                                      │
│ ⎇ feature/git-plugin                 │
│ ↑ 2  ↓ 0                             │
│                                      │
│ PR #3  feat: add git workspace       │
│ ● OPEN                               │
│                                      │
├──────────────────────────────────────┤
│ CHANGES                              │
│                                      │
│ M src/index.ts             +21 -4   │
│ M src/git.ts               +89 -12  │
│ A src/diff.ts              +143     │
│ ?? src/ui/                          │
│                                      │
├──────────────────────────────────────┤
│ COMMITS                              │
│                                      │
│ a83f91d feat: git workspace           │
│ 91ca812 refactor: tools               │
└──────────────────────────────────────┘

点击文件后显示结构化 Diff。

==============================
二十、测试要求
==============================

必须测试：

1. 普通 Git repository
2. 非 Git repository
3. 没有 remote
4. 有 GitHub remote
5. HTTPS GitHub remote
6. SSH GitHub remote
7. modified file
8. staged file
9. untracked file
10. deleted file
11. renamed file
12. copied file（如果 Git 能识别）
13. 空工作区
14. detached HEAD
15. branch 有 upstream
16. branch 没有 upstream
17. ahead / behind
18. gh 未安装
19. gh 未登录
20. GitHub 没有 PR
21. GitHub 有 PR
22. 多个 PR
23. 大型 diff
24. 带空格的文件名
25. Unicode 文件名
26. 恶意 path / 参数输入

测试不要依赖用户真实 GitHub account。

GitHub PR 部分应该通过 mock gh CLI / adapter 测试。

==============================
二十一、错误处理
==============================

不要让 Git / gh 的原始 stderr 直接成为 Agent tool 的最终错误。

统一定义错误类型，例如：

NOT_A_GIT_REPOSITORY
GIT_COMMAND_FAILED
INVALID_GIT_ARGUMENT
NO_GITHUB_REMOTE
GH_NOT_INSTALLED
GH_NOT_AUTHENTICATED
GITHUB_QUERY_FAILED
PR_NOT_FOUND
INVALID_REPOSITORY

Tool 返回结构化错误。

错误消息应该告诉 Agent 下一步怎么处理。

例如：

{
  "error": {
    "code": "GH_NOT_AUTHENTICATED",
    "message": "GitHub CLI is not authenticated.",
    "hint": "Run `gh auth login` and try again."
  }
}

==============================
二十二、Token / Context 控制
==============================

这是 Agent Tool，非常重要。

禁止默认返回：

整个 repository 的所有文件内容。

禁止：

git_workspace() → 完整 diff。

禁止：

git_commits() → 整个历史。

默认应该：

summary first
details on demand

推荐：

git_workspace()
    ↓
summary

git_files()
    ↓
file list

git_diff(path)
    ↓
specific diff

git_commits(limit)
    ↓
recent commits

github_pr()
    ↓
PR metadata

这样避免污染 Agent context。

==============================
二十三、代码质量
==============================

要求：

- TypeScript strict
- ESM
- 遵循 DeepSeek Harness 当前项目代码风格
- 不使用 any，除非确有必要
- 不复制 Harness 内部实现
- 不修改 node_modules
- 不修改 DeepSeek Harness source
- 不依赖未公开 API，除非源码明确存在
- API adapter 独立
- Git parsing 与 Tool 层分离
- GitHub CLI 与 Git 层分离
- 所有外部 command 都集中在 adapter
- 易于 mock
- 易于测试

建议抽象：

GitExecutor

GhExecutor

GitRepository

GitHubClient

Tools

例如：

GitExecutor
    ↓
GitRepository
    ↓
GitStatus / GitDiff / GitCommits

GhExecutor
    ↓
GitHubClient
    ↓
PullRequestTool

==============================
二十四、不要过度设计
==============================

第一版不要实现：

- GitHub OAuth
- GitHub REST API SDK
- GitHub GraphQL
- PR review comments
- PR approve
- PR merge
- commit / push
- branch creation
- checkout
- staging
- commit
- destructive Git commands
- 自动修改代码
- UI

这些都是未来能力。

第一版只做：

READ-ONLY Git / GitHub Workspace。

这是一个非常重要的安全边界。

==============================
二十五、README
==============================

README 必须包括：

1. 项目介绍
2. 功能
3. 安装
4. Profile 使用
5. Tool 列表
6. Tool 参数
7. 返回值示例
8. GitHub CLI 配置
9. 开发
10. 测试
11. 发布
12. 安全说明
13. Roadmap

安装示例：

dsh plugin --profile default add @tzzs/dsh-git-workspace

然后：

dsh --profile default

GitHub：

gh auth login

==============================
二十六、开发步骤
==============================

严格按照以下顺序：

STEP 1

研究当前 DeepSeek Harness master。

确认：

- plugin API
- bundle API
- profile API
- tool API
- shell API
- package conventions

把研究结果记录在：

docs/deepseek-harness-integration.md

不要凭猜测写代码。

STEP 2

创建插件 package。

STEP 3

实现 Bundle：

package.json
cordis.patch.yml

STEP 4

实现 Git repository adapter。

STEP 5

实现 git_status。

STEP 6

实现 git_files。

STEP 7

实现 git_diff。

STEP 8

实现 git_commits。

STEP 9

实现 GitHub remote parser。

STEP 10

实现 GitHub PR adapter。

STEP 11

实现 github_pr。

STEP 12

实现 git_workspace。

STEP 13

实现完整测试。

STEP 14

在真实 DeepSeek Harness profile 中安装：

dsh plugin --profile test add <local-package>

STEP 15

启动：

dsh --profile test

STEP 16

验证 Agent 能发现并调用所有 Tool。

STEP 17

验证真实 Git repository。

STEP 18

如果环境有 gh authentication，验证真实 GitHub PR。

STEP 19

修复所有 TypeScript / lint / test / runtime 问题。

==============================
二十七、验收标准
==============================

最终必须满足：

[ ] 不修改 DeepSeek Harness 源码

[ ] 可以作为独立 npm package

[ ] 包含 dsh.bundle

[ ] 可以使用 dsh plugin add 安装

[ ] 可以通过 profile 启用

[ ] Harness 正常启动

[ ] Agent 能发现 git_workspace

[ ] Agent 能发现 git_status

[ ] Agent 能发现 git_files

[ ] Agent 能发现 git_diff

[ ] Agent 能发现 git_commits

[ ] Agent 能发现 github_pr

[ ] git diff 可以查看具体修改

[ ] 可以查看修改文件

[ ] 可以查看 staged 文件

[ ] 可以查看 untracked 文件

[ ] 可以查看 commit

[ ] 可以查看当前 branch

[ ] 可以查看 ahead / behind

[ ] 可以找到当前 branch 对应 PR

[ ] GitHub CLI 未安装时不会 crash

[ ] GitHub CLI 未登录时不会 crash

[ ] 非 Git repository 不会 crash

[ ] 参数不会产生 shell injection

[ ] 大型 diff 不会无限制污染 context

[ ] 测试通过

[ ] TypeScript 检查通过

[ ] lint 通过

[ ] README 完整

==============================
二十八、最终输出
==============================

完成开发后，请输出：

1. 项目最终目录结构
2. DeepSeek Harness 插件机制分析
3. 实现了哪些 Tool
4. 每个 Tool 的参数
5. 每个 Tool 的返回值
6. 安装方式
7. 开发方式
8. 测试结果
9. 已知限制
10. 下一阶段 UI 设计建议

如果你实际修改了代码，请明确列出：

- 创建的文件
- 修改的文件
- 删除的文件
- 关键实现
- 测试命令
- 测试结果

不要只给我代码片段。

我要的是一个能够真正安装到 DeepSeek Harness 中运行的完整插件。

==============================
二十九、重要原则
==============================

最重要的原则：

1. 先研究当前 DeepSeek Harness 源码，再编码。
2. 使用官方 dsh.bundle / profile / plugin 机制。
3. 不修改 DeepSeek Harness 本体。
4. 第一版只实现 READ-ONLY Git / GitHub。
5. Git 使用 Git CLI。
6. GitHub 使用 gh CLI。
7. 所有 command 参数必须安全传递。
8. Tool 返回结构化数据。
9. Diff 必须支持按文件读取。
10. 默认不要把完整 diff 塞进 Agent context。
11. 为未来 Diff Viewer 和 PR Review 保留良好的数据结构。
12. 遵循当前 DeepSeek Harness master 的真实 API，而不是旧版本 API。
13. 如果官方 API 与本 Prompt 中的示例存在冲突，以当前源码为准。
14. 遇到 API 不确定时，先搜索源码确认，不要猜。
15. 最终必须进行真实的 bundle 安装和 Harness 启动验证。
