# Verify you're on the correct commit before testing
$expectedCommit = "a41b16dc64008ab89b8e9f408f88192cfadef4a9"
$currentCommit = git rev-parse HEAD

Write-Host "Current commit: $currentCommit"
Write-Host "Expected commit: $expectedCommit"
Write-Host ""

if ($currentCommit -eq $expectedCommit) {
    Write-Host "✓ You're on the correct commit!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ WRONG COMMIT!" -ForegroundColor Red
    Write-Host "Run: git reset --hard a41b16d" -ForegroundColor Yellow
    exit 1
}