# deploy.ps1 - Build and push the Hobgoblin frontend
# Run from the frontend folder: .\deploy.ps1 "Your commit message"

param(
  [string]$Message = "Deploy"
)

$ErrorActionPreference = "Stop"
$FrontendDir = $PSScriptRoot
$DistDir     = Join-Path $FrontendDir "dist"
$GitBackup   = Join-Path $FrontendDir ".git-dist-backup"

Write-Host "`n==> Backing up dist/.git..." -ForegroundColor Cyan
if (Test-Path "$DistDir\.git") {
  if (Test-Path $GitBackup) { cmd /c "rd /s /q `"$GitBackup`"" }
  Copy-Item "$DistDir\.git" $GitBackup -Recurse
} else {
  Write-Host "    No .git in dist -- will restore after build." -ForegroundColor Yellow
}

Write-Host "`n==> Building..." -ForegroundColor Cyan
Set-Location $FrontendDir
# Force the production API + app key into the web bundle. These override any
# .env / .env.local (which point at the local Herd backend + dev key), so a
# deploy can never accidentally ship localhost or the wrong X-App-Key.
$env:EXPO_PUBLIC_API_URL = "https://api.ahomerun.net/api"
$env:EXPO_PUBLIC_APP_KEY = "HeXlf23CVxCGIFpvpaYzoh3vCYWKKXh6mp8AOzdz"
# Clear caches so the export always reflects the current source. Without this,
# Metro reuses a cached bundle and the deploy reports "nothing to commit" even
# though the source changed (the bundle hash never moves).
Write-Host "    Clearing Metro / Expo caches..." -ForegroundColor DarkCyan
if (Test-Path ".expo") { Remove-Item -Recurse -Force ".expo" -ErrorAction SilentlyContinue }
Remove-Item -Recurse -Force "$env:TEMP\metro-*","$env:TEMP\haste-map-*" -ErrorAction SilentlyContinue

# --clear forces a cold bundler build (this is the export half of `build:web`).
npx expo export --platform web --clear
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed (expo export)."; exit 1 }
npm run fix:html
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed (fix:html)."; exit 1 }

Write-Host "`n==> Restoring dist/.git..." -ForegroundColor Cyan
if (Test-Path $GitBackup) {
  Copy-Item $GitBackup "$DistDir\.git" -Recurse -Force
  cmd /c "rd /s /q `"$GitBackup`""
} else {
  Write-Host "    Cloning remote to bootstrap .git..." -ForegroundColor Yellow
  $Tmp = Join-Path $env:TEMP "hob-git-init"
  if (Test-Path $Tmp) { cmd /c "rd /s /q `"$Tmp`"" }
  git clone https://github.com/fluidcontentinc/hobgoblin-web.git $Tmp --no-checkout --depth 1
  Copy-Item "$Tmp\.git" "$DistDir\.git" -Recurse -Force
  cmd /c "rd /s /q `"$Tmp`""
}

Write-Host "`n==> Committing and pushing..." -ForegroundColor Cyan
Set-Location $DistDir
git add -A
git commit -m $Message
git push

Write-Host "`nDeployed: $Message" -ForegroundColor Green
Set-Location $FrontendDir
