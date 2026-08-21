import * as React from 'react'
import { GitWorkspaceRow } from './toolview/workspace-row.js'
import { StatusRow } from './toolview/status-row.js'
import { DiffRow } from './toolview/diff-row.js'
import { CommitsRow } from './toolview/commits-row.js'
import { ShowRow } from './toolview/show-row.js'
import { PrRow } from './toolview/pr-row.js'
import { CiRow } from './toolview/ci-row.js'
import { GenericRow } from './toolview/generic-row.js'
import { GitWorkspaceHeaderAction } from './panel/container.js'

export const inject = ['slots', 'sessions', 'connection', 'layout']

const TOOLVIEW = [
  ['git_workspace', GitWorkspaceRow],
  ['git_status', StatusRow],
  ['git_diff', DiffRow],
  ['git_commits', CommitsRow],
  ['git_show', ShowRow],
  ['github_pr', PrRow],
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

// Register into a slot, isolating failures so one bad slot never removes the
// rest of the plugin's contributions (each slots.inject defers until the slot
// is declared; a throwing callback would otherwise tear down the whole fiber).
function safeInject(ctx, slot, def, component) {
  try {
    return ctx.slots.inject(slot, () =>
      ctx.slots.register(def, component),
    )
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.error(`[dsh-git-workspace] failed to register ${slot}:`, error)
    }
    return () => {}
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = []

    for (const [name, component] of TOOLVIEW) {
      disposers.push(
        safeInject(ctx, 'tool.call.toolview', { name: 'tool.call.toolview', key: name }, component),
      )
    }

    disposers.push(
      safeInject(
        ctx,
        'conversation.session.header.actions',
        { name: 'conversation.session.header.actions', id: 'git-workspace', order: 10 },
        GitWorkspaceHeaderAction,
      ),
    )

    return () => disposers.forEach((d) => d())
  }, 'dsh-git-workspace: ui')
}
