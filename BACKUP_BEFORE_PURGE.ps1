# Backup Script - Run this BEFORE purging git history
# This creates a complete backup of your repository

$projectPath = "c:\Projects\engagesuite.ai"
$backupPath = "c:\Projects\engagesuite.ai-BACKUP-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"

Write-Host "Creating backup of repository..." -ForegroundColor Yellow
Write-Host "Source: $projectPath" -ForegroundColor Cyan
Write-Host "Backup: $backupPath" -ForegroundColor Cyan

# Create backup directory
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Copy entire project (excluding node_modules for speed, but keeping everything else)
Write-Host "`nCopying files..." -ForegroundColor Yellow
robocopy $projectPath $backupPath /E /XD node_modules .git /XF *.log /R:3 /W:5 /NP /NDL /NFL

# Also backup .git folder separately (important!)
Write-Host "`nBacking up .git folder..." -ForegroundColor Yellow
robocopy "$projectPath\.git" "$backupPath\.git" /E /R:3 /W:5 /NP /NDL /NFL

Write-Host "`n✅ Backup complete!" -ForegroundColor Green
Write-Host "Backup location: $backupPath" -ForegroundColor Cyan
Write-Host "`nYou can now safely proceed with git history purge." -ForegroundColor Green
Write-Host "If anything goes wrong, restore from: $backupPath" -ForegroundColor Yellow
