# ============================================================
# Game of Ecom - Reset corrupt git + re-commit clean
#
# Uses 'Continue' error mode so git's harmless LF/CRLF warnings
# don't kill the script. .gitignore is already updated.
# ============================================================

# IMPORTANT: keep on Continue, not Stop, because git writes
# benign warnings to stderr that PowerShell otherwise treats as fatal.
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

Set-Location "C:\Users\Admin\Documents\Claude\Projects\DEMAN"

Write-Host "=== Reset corrupt .git folder ===" -ForegroundColor Magenta

# 1. Force-delete .git folder
if (Test-Path ".git") {
    Write-Host "-> Removing .git folder" -ForegroundColor Cyan
    Remove-Item -Recurse -Force ".git" -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    if (Test-Path ".git") {
        & cmd /c "rmdir /s /q .git" | Out-Null
    }
    if (Test-Path ".git") {
        Write-Host "FAIL Could not delete .git. Close editors/explorers viewing folder and retry." -ForegroundColor Red
        exit 1
    }
    Write-Host "OK .git removed" -ForegroundColor Green
}

# 2. Verify .gitignore has all leak fixes
$gi = Get-Content ".gitignore" -Raw
$needs = @("Oniiz_\*", "slide-\*\.jpg", "\*\.tmp", "/\*\.png")
foreach ($pat in $needs) {
    if ($gi -notmatch $pat) {
        Write-Host "FAIL .gitignore missing pattern: $pat" -ForegroundColor Red
        exit 1
    }
}
Write-Host "OK .gitignore contains V22.7.1 leak fixes" -ForegroundColor Green

# 3. Fresh git init + configure to suppress LF/CRLF warnings
Write-Host ""
Write-Host "=== Fresh git init ===" -ForegroundColor Magenta
& git init -b main 2>$null | Out-Null
& git config user.name "Nang" 2>$null
& git config user.email "nangluongmr@gmail.com" 2>$null
& git config core.autocrlf false 2>$null
& git config core.safecrlf false 2>$null
Write-Host "OK Git initialized" -ForegroundColor Green

# 4. Add files (suppress all stderr to avoid PowerShell error stream pollution)
Write-Host ""
Write-Host "=== Staging files ===" -ForegroundColor Magenta
$null = & git add . 2>&1
Write-Host "OK Files staged" -ForegroundColor Green

# 5. Leak audit
Write-Host ""
Write-Host "=== Leak audit (all must be 0) ===" -ForegroundColor Magenta

# Get list of staged files into a variable so we don't re-call git for every check
$staged = & git ls-files 2>$null

$audits = [ordered]@{
    "Oniiz/Hyro files"      = @($staged | Where-Object { $_ -match "Oniiz|Hyro" })
    "slide-XX images"       = @($staged | Where-Object { $_ -match "^slide-\d+\.(jpg|png|jpeg)$" })
    "*.tmp files"           = @($staged | Where-Object { $_ -match "\.tmp$" })
    "*.docx files"          = @($staged | Where-Object { $_ -match "\.docx$" })
    "*.pdf files"           = @($staged | Where-Object { $_ -match "\.pdf$" })
    "*.xlsx files"          = @($staged | Where-Object { $_ -match "\.xlsx$" })
    "*.pptx files"          = @($staged | Where-Object { $_ -match "\.pptx$" })
    "audio/*.mp3"           = @($staged | Where-Object { $_ -match "audio/.+\.mp3$" })
    "Loose root images"     = @($staged | Where-Object { $_ -match "^[^/]+\.(png|jpg|jpeg)$" })
    "Old deploy_v*.ps1"     = @($staged | Where-Object { $_ -match "deploy_v\d+.*\.ps1$" })
}

$totalLeaks = 0
foreach ($k in $audits.Keys) {
    $list = $audits[$k]
    $cnt = $list.Count
    if ($cnt -gt 0) {
        Write-Host ("FAIL  {0}: {1} leak(s)" -f $k, $cnt) -ForegroundColor Red
        $list | Select-Object -First 5 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkRed }
        $totalLeaks += $cnt
    } else {
        Write-Host ("OK    {0}: 0 (clean)" -f $k) -ForegroundColor Green
    }
}

if ($totalLeaks -gt 0) {
    Write-Host ""
    Write-Host "FAIL $totalLeaks file(s) still leaking. Add patterns to .gitignore and retry." -ForegroundColor Red
    exit 1
}

# 6. Show preview
$totalFiles = $staged.Count
Write-Host ""
Write-Host "OK Clean commit ready: $totalFiles files" -ForegroundColor Green
Write-Host ""
Write-Host "=== Sample (first 30) ===" -ForegroundColor Cyan
$staged | Select-Object -First 30 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# 7. Commit
Write-Host ""
Write-Host "-> git commit" -ForegroundColor Cyan
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
$null = & git commit -F $msgFile 2>&1
Remove-Item $msgFile -ErrorAction SilentlyContinue

# Verify commit was created
$lastCommit = & git log --oneline -1 2>$null
if ([string]::IsNullOrWhiteSpace($lastCommit)) {
    Write-Host "FAIL Commit not created." -ForegroundColor Red
    exit 1
}
Write-Host "OK Commit: $lastCommit" -ForegroundColor Green

# 8. Push prompt
Write-Host ""
Write-Host "=== GitHub remote setup ===" -ForegroundColor Magenta
Write-Host "1. Create empty repo at https://github.com/new (name: game-of-ecom, Private)" -ForegroundColor Yellow
Write-Host "2. Do NOT init with README/license" -ForegroundColor Yellow
Write-Host "3. Copy HTTPS URL" -ForegroundColor Yellow
Write-Host ""
$repoUrl = Read-Host "Paste GitHub repo URL (or empty to skip push)"

if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Host "Skipped push. To push later:" -ForegroundColor Gray
    Write-Host "  git remote add origin <URL>" -ForegroundColor White
    Write-Host "  git push -u origin main" -ForegroundColor White
    exit 0
}

# Remove existing origin if any
$existing = & git remote 2>$null
if ($existing -match "origin") {
    & git remote remove origin 2>$null
}

Write-Host "-> git remote add origin $repoUrl" -ForegroundColor Cyan
& git remote add origin $repoUrl 2>$null

Write-Host "-> git push -u origin main" -ForegroundColor Cyan
Write-Host "  Credentials prompt:" -ForegroundColor Gray
Write-Host "    Username = GitHub username" -ForegroundColor Gray
Write-Host "    Password = NEW Personal Access Token (revoke the leaked one first!)" -ForegroundColor Gray
Write-Host ""

& git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS - Repo pushed!" -ForegroundColor Green
    Write-Host "View at: $repoUrl" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "Push failed. Verify credentials/URL and retry: git push -u origin main" -ForegroundColor Red
}
