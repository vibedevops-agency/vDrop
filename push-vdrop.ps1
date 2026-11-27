# Push vDrop using vibedevops-agency without changing your global gh (other account) login.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$override = Join-Path $PSScriptRoot "gitconfig-vdrop-push"
$env:GIT_CONFIG_GLOBAL = $override

git config --local credential.useHttpPath true
git remote set-url origin "https://vibedevops-agency@github.com/vibedevops-agency/vDrop.git"

Write-Host "Pushing vDrop (GCM / vibedevops-agency)..." -ForegroundColor Cyan
git push @args

if ($LASTEXITCODE -eq 0) {
    Write-Host "https://github.com/vibedevops-agency/vDrop" -ForegroundColor Green
}