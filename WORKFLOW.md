# Gemini Voyager Local Workflow

This repo is configured for a fork-first workflow:

- `upstream` = official repo (`Nagi-ovo/gemini-voyager`)
- `origin` = your fork (`MaxMiksa/gemini-voyager`)
- `upstream` push is disabled to avoid accidental pushes

## Branch Model

- `sync/upstream-main`
  - Read-only mirror of official `upstream/main`
  - Never put custom features here
- `local/main`
  - Your long-lived local integration branch
  - Used for daily extension usage (official latest + your selected features)
- `feat/*`
  - One feature per branch/PR
  - Always PR these branches to official repo

Current local integration source:

- `local/main` currently points to the same commit as `feat/local-unified-latest`

## One-Time Safety Setup

```powershell
git remote set-url --push upstream DISABLED
```

Verify:

```powershell
git remote -v
```

Expected:

- `upstream` has fetch URL
- `upstream` push URL is `DISABLED`

## Daily Sync Routine

1. Sync remote refs.
2. Fast-forward `sync/upstream-main` to official latest.
3. Rebase or merge `local/main` onto new official base.

```powershell
git fetch --all --prune
git branch -f sync/upstream-main upstream/main
git switch local/main
git merge --ff-only sync/upstream-main
```

If `--ff-only` fails (because `local/main` has your commits), use:

```powershell
git switch local/main
git merge sync/upstream-main
```

## Keep Local Integration Branch on GitHub (Backup)

```powershell
git push -u origin local/main
```

After first push:

```powershell
git push
```

## Start a New Feature (PR Branch)

Use `sync/upstream-main` as clean PR base:

```powershell
git fetch --all --prune
git switch sync/upstream-main
git switch -c feat/<feature-name>
```

Or with worktree:

```powershell
git worktree add worktrees/<feature-name> -b feat/<feature-name> sync/upstream-main
```

Then push and open PR from `feat/<feature-name>` to `upstream/main`.

## Bring a Finished Feature into Local Daily Version

From feature branch to `local/main`:

```powershell
git switch local/main
git cherry-pick <feature-commit-sha>
git push
```

Alternative (merge full feature branch):

```powershell
git switch local/main
git merge --no-ff feat/<feature-name>
git push
```

## Build for Local Browser Usage

Build from `local/main` worktree and load `dist_chrome` as unpacked extension.

```powershell
npm run build
```

Output:

- `dist_chrome/`

Recommendation:

- Keep two browser profiles:
  - `Daily`: load stable build from `local/main`
  - `Dev`: load feature branch build for testing

## PR Rule

- Never open PR from `local/main`
- Always open PR from a single-purpose `feat/*` branch

## Quick Health Check

```powershell
git remote -v
git branch -vv
git worktree list
```
