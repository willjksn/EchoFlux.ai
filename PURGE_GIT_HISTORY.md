# Purge .env Files from Git History

⚠️ **CRITICAL WARNING**: This operation rewrites git history. Coordinate with your team before proceeding.

## Prerequisites

1. **Backup your repository** (create a full backup/clone)
2. **Coordinate with team** - everyone needs to re-clone after this
3. **Ensure all secrets are rotated** (already done ✅)

## Method 1: Using git-filter-repo (Recommended - Fastest)

### Install git-filter-repo

**Windows (PowerShell):**
```powershell
# Install via pip (requires Python)
pip install git-filter-repo
```

**Or download from:** https://github.com/newren/git-filter-repo

### Purge .env files

```powershell
cd c:\Projects\engagesuite.ai

# Remove .env and .env.production.env from all history
git filter-repo --path .env --path .env.production.env --invert-paths --force

# Verify removal
git log --all --full-history -- .env .env.production.env
# Should return nothing
```

## Method 2: Using BFG Repo-Cleaner (Alternative)

### Install BFG

1. Download from: https://rtyley.github.io/bfg-repo-cleaner/
2. Extract `bfg.jar` to a folder in your PATH

### Purge .env files

```powershell
cd c:\Projects\engagesuite.ai

# Create a fresh clone (BFG requires this)
cd ..
git clone --mirror engagesuite.ai engagesuite.ai-backup.git

# Remove .env files
java -jar bfg.jar --delete-files .env engagesuite.ai-backup.git
java -jar bfg.jar --delete-files .env.production.env engagesuite.ai-backup.git

# Clean up
cd engagesuite.ai-backup.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Push back (WARNING: Force push required)
git push --force
```

## Method 3: Using git filter-branch (Slower, but built-in)

```powershell
cd c:\Projects\engagesuite.ai

# Remove .env from all branches and history
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .env .env.production.env" --prune-empty --tag-name-filter cat -- --all

# Clean up
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## After Purging

### 1. Force push to remote (⚠️ DESTRUCTIVE)

```powershell
# WARNING: This rewrites remote history
git push origin --force --all
git push origin --force --tags
```

### 2. Notify team members

Everyone must:
```powershell
# Delete local repo
cd ..
Remove-Item -Recurse -Force engagesuite.ai

# Re-clone fresh
git clone <your-repo-url> engagesuite.ai
cd engagesuite.ai
```

### 3. Verify secrets are rotated

- ✅ Firebase service account key - Rotated
- ✅ Gemini API key - Rotated  
- ✅ CRON_SECRET - Set in Vercel
- ✅ All other keys from .env - Rotated

## Verification

```powershell
# Check that .env is no longer in history
git log --all --full-history --oneline -- .env

# Should return nothing

# Verify .env is in .gitignore
cat .gitignore | Select-String "\.env"

# Should show .env and .env.* entries
```

## Important Notes

1. **GitHub/GitLab**: If using hosted git, you may need to contact support to purge from their backups
2. **Forks**: Anyone who forked your repo will still have the old history
3. **Backups**: Consider if you have any other backups (CI/CD logs, etc.) that might contain secrets
4. **Secrets Rotation**: Ensure ALL secrets from the committed .env are rotated before proceeding

## Recommended: Use git-filter-repo

It's the fastest and most reliable method. If you don't have it installed, Method 3 (git filter-branch) will work but is slower.
