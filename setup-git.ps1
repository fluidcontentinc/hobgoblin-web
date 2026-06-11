# One-time setup: put the frontend SOURCE under git.
#
# IMPORTANT: origin is the same repo deploy.ps1 publishes the BUILT site to
# (fluidcontentinc/hobgoblin-web, branch "main", served at hob.ahomerun.net).
# To avoid clobbering the live site, this script pushes the source to the
# "source" branch of that repo. Built site = main, source code = source.
#
# Usage (from this folder):
#   .\setup-git.ps1
#
# After this, day-to-day:  git add -A ; git commit -m "msg" ; git push
# (push goes to origin/source automatically). Deploys stay: .\deploy.ps1 "msg"

param([string]$Remote = "https://github.com/fluidcontentinc/hobgoblin-web.git")

Set-Location $PSScriptRoot

# H: is exFAT/FAT32 (no ownership info), so git needs this folder whitelisted
# or every command dies with "detected dubious ownership".
$safePath = $PSScriptRoot -replace '\\', '/'
$existing = git config --global --get-all safe.directory 2>$null
if ($existing -notcontains $safePath) {
  git config --global --add safe.directory $safePath
  Write-Host "Added safe.directory exception for $safePath"
}

# Clear any half-initialized .git state (a previous init left a stale lock).
if (Test-Path .git\config.lock) { Remove-Item .git\config.lock -Force }

git init -b main
git add -A
git commit -m @"
Initial commit: Hobgoblin Hunt frontend source

- Parent mission watch: Menu / Hunt shows the kid's Path of Power map
  read-only with a 'kid is here' marker (multi-kid selector); Menu /
  Missions shows per-kid mission cards (progress, current stop, up next).
- Kid Detail: 'Where they are' section (current step status + up next).
- Map state flows from /parent/kids/{id}/progress via the shared
  transformRawMapNode - no backend changes.
- Design pass: flattened all pill/rounded corners to the radius-4 canon
  (true circles exempt); admin radii tokens flattened.
"@

if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed - check output above."
  exit 1
}

git remote add origin $Remote
# Local branch "main" -> remote branch "source" (repo's main belongs to the built site)
git push -u origin main:source

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done. Source is on origin/source; the built site stays on origin/main."
  Write-Host "Day-to-day: git add -A ; git commit -m 'msg' ; git push"
} else {
  Write-Host "Push failed - check your GitHub credentials and that the repo exists."
}
