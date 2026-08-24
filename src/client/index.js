import { GitWorkspaceRow } from './toolview/workspace-row.js'
import { StatusRow } from './toolview/status-row.js'
import { DiffRow } from './toolview/diff-row.js'
import { CommitsRow } from './toolview/commits-row.js'
import { ShowRow } from './toolview/show-row.js'
import { PrRow } from './toolview/pr-row.js'
import { CiRow } from './toolview/ci-row.js'
import { GenericRow } from './toolview/generic-row.js'
import { GitWorkspaceControl } from './panel/container.js'
import { bindHostContext } from './services.js'
import { ensureStyles } from './components.js'

export const inject = ['slots']

const TOOLVIEW = [
  ['git_workspace', GitWorkspaceRow],
  ['git_status', StatusRow],
  ['git_diff', DiffRow],
  ['git_commits', CommitsRow],
  ['git_show', ShowRow],
  ['github_pr', PrRow],
  ['github_pr_create', GenericRow],
  ['github_ci', CiRow],
  ['git_files', GenericRow],
  ['git_compare', GenericRow],
  ['git_blame', GenericRow],
  ['git_branches', GenericRow],
  ['git_remotes', GenericRow],
  ['git_worktrees', GenericRow],
  ['git_stash', GenericRow],
  ['git_tags', GenericRow],
  ['github_pr_diff', GenericRow],
  ['github_pr_reviews', GenericRow],
  ['github_pr_comments', GenericRow],
  ['github_ci_logs', GenericRow],
  ['github_issue', GenericRow],
  ['github_issue_comments', GenericRow],
  ['github_releases', GenericRow],
]

function registerSlot(ctx, slot, def, component) {
  try {
    ctx.slots.inject(slot, () => ctx.slots.register(def, component))
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.error(`[dsh-git-workspace] failed to register ${slot}:`, error)
    }
  }
}

export function apply(ctx) {
  bindHostContext(ctx)
  ensureStyles()
  for (const [name, component] of TOOLVIEW) {
    registerSlot(
      ctx,
      'tool.call.toolview',
      { name: 'tool.call.toolview', key: name },
      component,
    )
  }
  registerSlot(
    ctx,
    'conversation.input.left',
    { name: 'conversation.input.left', id: 'git-workspace', order: 10 },
    GitWorkspaceControl,
  )
}
