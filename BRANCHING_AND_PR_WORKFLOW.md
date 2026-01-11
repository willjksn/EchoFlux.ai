 ## Branching & PR Workflow

This is a lightweight, repeatable process to keep `main` production-ready while allowing safe testing and previewing of changes.

### What is a PR?
- PR = Pull Request. It’s a change proposal from a feature branch back into `main`.
- It groups commits, shows diffs, runs CI checks, and (optionally) gets review before merge.
- In hosted platforms (GitHub), a PR also provides discussion, approvals, and deployment previews.

### Golden Rules
- `main` stays clean and deployable. Do not commit directly to `main`.
- One logical scope per branch. Small, focused PRs merge faster and are easier to test.
- Always test on your branch (local + preview) before merging to `main`.

### Daily Flow (short feature branches)
1) Sync main
   - `git checkout main`
   - `git pull origin main`
2) Create a feature branch
   - `git checkout -b feature/<short-topic>`
   - Examples: `feature/content-brain-platform-buttons`, `feature/strategy-autosave`
3) Develop and test locally
   - Run app/build/tests as needed: `npm run build` (or your usual test commands).
4) Push branch and open PR
   - `git push origin feature/<short-topic>`
   - Open a PR into `main` with a clear summary and test notes.
5) Use preview to validate
   - Verify the branch preview (e.g., Vercel) matches requirements and fixes regressions.
6) Merge to main
   - After checks/preview pass (and review if needed), merge the PR into `main`.
7) Deploy main
   - Trigger production deploy from `main`. Avoid hotfixing on `main`; use a `hotfix/<issue>` branch if urgent.

### PR Template (suggested)
- **Summary**: 2–4 bullets of what changed and why.
- **Testing**: list commands/flows you ran (e.g., `npm run build`, “smoke: captions gen, strategy autosave, media vault rename”).
- **Risks/Mitigations**: any areas that might regress and how you checked them.

### Handling Hotfixes
- Branch from `main`: `git checkout -b hotfix/<issue>`
- Keep the diff minimal; test; push; open PR → merge → deploy.

### Keeping branches tidy
- Delete feature/hotfix branches after merge.
- If a branch lingers, rebase/merge `main` before continuing to reduce conflicts.

### Troubleshooting
- **Branch can’t be deleted**: it may be attached to another worktree. Detach the worktree or delete it before removing the branch.
- **Preview mismatch**: ensure the branch is pushed; re-run the preview build; confirm environment variables are set for the preview environment.
- **Large PRs**: split into smaller branches by scope (e.g., “UI layout fixes” vs. “API restore”).
