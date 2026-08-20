import * as React from 'react'
import { GitWorkspaceRow } from './toolview/workspace-row.js'
import { StatusRow } from './toolview/status-row.js'
import { DiffRow } from './toolview/diff-row.js'
import { CommitsRow } from './toolview/commits-row.js'
import { ShowRow } from './toolview/show-row.js'
import { PrRow } from './toolview/pr-row.js'
import { CiRow } from './toolview/ci-row.js'
import { GenericRow } from './toolview/generic-row.js'
import { GitWorkspaceContainer, GitWorkspaceFooterAction } from './panel/container.js'

export const inject = ['slots', 'sessions', 'connection', 'layout']

export function apply(ctx) {
  ctx.effect(() => {
    const register = (name, Component) =>
      ctx.slots.inject('tool.call.toolview', () =>
        ctx.slots.register(
          {
            name: 'tool.call.toolview',
            key: name,
          },
          Component,
        ),
      )
    const disposers = [
      register('git_workspace', GitWorkspaceRow),
      register('git_status', StatusRow),
      register('git_diff', DiffRow),
      register('git_commits', CommitsRow),
      register('git_show', ShowRow),
      register('github_pr', PrRow),
      register('github_ci', CiRow),
      register('git_files', GenericRow),
      register('git_compare', GenericRow),
      register('git_blame', GenericRow),
      register('git_branches', GenericRow),
      register('git_remotes', GenericRow),
      register('git_worktrees', GenericRow),
      register('git_stash', GenericRow),
      register('git_tags', GenericRow),
      register('github_pr_diff', GenericRow),
      register('github_pr_reviews', GenericRow),
      register('github_pr_comments', GenericRow),
      register('github_ci_logs', GenericRow),
      register('github_issue', GenericRow),
      register('github_issue_comments', GenericRow),
      register('github_releases', GenericRow),
    ]

    const overlayDisposer = ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        {
          name: 'shell.overlay',
          id: 'git-workspace-panel',
        },
        GitWorkspaceContainer,
      ),
    )

    const footerDisposer = ctx.slots.inject('sidebar.footer.action', () =>
      ctx.slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'git-workspace',
          order: 10,
        },
        GitWorkspaceFooterAction,
      ),
    )

    return () => {
      disposers.forEach((d) => d())
      overlayDisposer()
      footerDisposer()
    }
  }, 'dsh-git-workspace: ui')
}
