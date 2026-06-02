# ============================================================
# Game of Ecom - GitHub Init and Push Script
#
# Run from DEMAN/ folder. ASCII-only to avoid encoding issues.
# Safe to run multiple times.
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "=== Game of Ecom -> GitHub init ===" -ForegroundColor Magenta

$root = "C:\Users\Admin\Documents\Claude\Projects\DEMAN"
Set-Location $root

# 1. Verify required files exist
$required = @(
    "fb-pack-studio.html",
    "README.md",
    "AGENTS.md",
    "LICENSE",
    ".gitignore",
    "fb-pack-studio-deploy\index.html",
    "fb-pack-studio-deploy\wrangler.toml",
    "fb-pack-studio-deploy\deploy_goe.ps1"
)
foreach ($f in $required) {
    if (-not (Test-Path $f)) {
        Write-Host "FAIL Missing required file: $f" -ForegroundColor Red
        exit 1
    }
}
Write-Host "OK All required files present" -ForegroundColor Green

# 2. Verify git is installed
try {
    $gitVer = & git --version
    Write-Host "OK Git: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "FAIL Git not found. Install from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# 3. Init repo if not exists
if (-not (Test-Path ".git")) {
    Write-Host "-> git init" -ForegroundColor Cyan
    & git init -b main | Out-Null
    & git config user.name "Nang" | Out-Null
    & git config user.email "nangluongmr@gmail.com" | Out-Null
    Write-Host "OK Git repo initialized with main branch" -ForegroundColor Green
} else {
    Write-Host "OK Git repo already exists" -ForegroundColor Green
}

# 4. Preview what will be committed
Write-Host ""
Write-Host "-> Dry-run: files that WILL be added to git" -ForegroundColor Cyan
$files = & git status --short --untracked-files=all 2>&1
$count = ($files | Measure-Object -Line).Lines
Write-Host "  Total: $count entries" -ForegroundColor Yellow
Write-Host "  Sample (first 20):" -ForegroundColor Gray
$files | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
if ($count -gt 20) {
    Write-Host "    ... and $($count - 20) more (run 'git status' to see all)" -ForegroundColor Gray
}

# 5. Show approx size
Write-Host ""
Write-Host "-> Estimated repo size:" -ForegroundColor Cyan
$mainSize = (Get-Item "fb-pack-studio.html").Length / 1MB
$deploySize = (Get-Item "fb-pack-studio-deploy\index.html").Length / 1MB
$totalMB = $mainSize + $deploySize + 0.5
Write-Host ("  fb-pack-studio.html: {0:N2} MB" -f $mainSize) -ForegroundColor Gray
Write-Host ("  index.html (mirror): {0:N2} MB" -f $deploySize) -ForegroundColor Gray
Write-Host ("  Total tracked: ~{0:N2} MB (below GitHub 100MB/file limit)" -f $totalMB) -ForegroundColor Gray

# 6. Confirm before commit
Write-Host ""
$ans = Read-Host "Continue with first commit? (Y/N)"
if ($ans -notmatch "^[yY]") {
    Write-Host "Aborted by user." -ForegroundColor Red
    exit 0
}

# 7. Add + commit (simple single-line message to avoid PS quoting issues)
Write-Host ""
Write-Host "-> git add ." -ForegroundColor Cyan
& git add .
Write-Host "-> git commit" -ForegroundColor Cyan

# Build commit message file (avoid quoting headaches with -F flag)
$msgFile = Join-Path $env:TEMP "goe_commit_msg.txt"
$commitLines = @(
    "Initial commit - Game of Ecom V22.8",
    "",
    "Single-file React + Cloudflare Pages app for AI-driven",
    "Vietnamese e-commerce content creation. Features:",
    "",
    " * 30-day pack wizard (Gemini-powered)",
    " * Storyboard pipeline (10s scenes, 8-frame breakdown)",
    " * Voice production engine (NotebookLM/Nano Banana/Veo/CapCut)",
    " * MCP server (50+ tools, OAuth 2.1) for Claude integration",
    " * Video Studio (WebCodecs MP4 export)",
    " * Meta Marketing API + Zernio publishing",
    " * Brand Genesis Lab (advanced strategy research)",
    "",
    "See AGENTS.md for codebase tour, README.md for setup."
)
$commitLines | Out-File -FilePath $msgFile -Encoding ASCII

& git commit -F $msgFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL Commit failed. Resolve issues above and retry." -ForegroundColor Red
    Remove-Item $msgFile -ErrorAction SilentlyContinue
    exit 1
}
Remove-Item $msgFile -ErrorAction SilentlyContinue
Write-Host "OK First commit created" -ForegroundColor Green

# 8. Prompt for GitHub remote URL
Write-Host ""
Write-Host "=== GitHub remote setup ===" -ForegroundColor Magenta
Write-Host "1. Open https://github.com/new" -ForegroundColor Yellow
Write-Host "2. Repo name suggestion: game-of-ecom" -ForegroundColor Yellow
Write-Host "3. Choose Private (recommended) or Public" -ForegroundColor Yellow
Write-Host "4. DO NOT initialize with README/license (we have our own)" -ForegroundColor Yellow
Write-Host "5. Click Create repository" -ForegroundColor Yellow
Write-Host "6. Copy the HTTPS URL (e.g. https://github.com/yourname/game-of-ecom.git)" -ForegroundColor Yellow
Write-Host ""
$repoUrl = Read-Host "Paste GitHub repo URL here (or empty to skip push)"

if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Host ""
    Write-Host "Skipped push. To push later, run:" -ForegroundColor Gray
    Write-Host "  git remote add origin <URL>" -ForegroundColor White
    Write-Host "  git push -u origin main" -ForegroundColor White
    exit 0
}

# 9. Add remote and push
Write-Host ""

# Remove existing origin if any
$existing = & git remote 2>&1
if ($existing -match "origin") {
    Write-Host "-> Replacing existing 'origin' remote" -ForegroundColor Cyan
    & git remote remove origin
}

Write-Host "-> git remote add origin $repoUrl" -ForegroundColor Cyan
& git remote add origin $repoUrl

Write-Host "-> git push -u origin main" -ForegroundColor Cyan
Write-Host "  When prompted for credentials:" -ForegroundColor Gray
Write-Host "    Username: your GitHub username" -ForegroundColor Gray
Write-Host "    Password: paste your Personal Access Token (NOT password)" -ForegroundColor Gray
Write-Host "  Generate token at: https://github.com/settings/tokens (scope: repo)" -ForegroundColor Gray
Write-Host ""

& git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS - Repo pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps for collaborators:" -ForegroundColor Yellow
    Write-Host "  1. Share repo URL with them" -ForegroundColor White
    Write-Host "  2. They clone, follow README.md Quick Start" -ForegroundColor White
    Write-Host "  3. Each deploys to their own Cloudflare account" -ForegroundColor White
    Write-Host "  4. For AI agents: point them at AGENTS.md" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "FAIL Push failed. Common causes:" -ForegroundColor Red
    Write-Host "  - Bad credentials -> regenerate Personal Access Token at github.com/settings/tokens" -ForegroundColor Yellow
    Write-Host "  - Repo URL typo -> verify, then: git remote set-url origin <correct URL>" -ForegroundColor Yellow
    Write-Host "  - Network -> retry: git push -u origin main" -ForegroundColor Yellow
}
