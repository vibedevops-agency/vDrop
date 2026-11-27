# Sign in to GitHub for THIS repo only (vibedevops-agency/vDrop).
# Does not remove or change other GitHub accounts (e.g. personal projects).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== vDrop GitHub login (vibedevops-agency only) ===" -ForegroundColor Cyan
Write-Host "Other accounts stay in Git Credential Manager for their own repo URLs." -ForegroundColor DarkGray
Write-Host "This folder uses credential.useHttpPath + vibedevops-agency@ in origin." -ForegroundColor DarkGray
Write-Host ""
Write-Host "If the browser opens as the wrong user, sign out of GitHub in that tab" -ForegroundColor DarkGray
Write-Host "or use a Chrome profile where vibedevops-agency is logged in." -ForegroundColor DarkGray
Write-Host ""

git config --local credential.useHttpPath true
git remote set-url origin "https://vibedevops-agency@github.com/vibedevops-agency/vDrop.git"

$choice = Read-Host "Browser login (B) or paste PAT (P)? [B/p]"
if ($choice -eq "p" -or $choice -eq "P") {
    $user = "vibedevops-agency"
    $sec = Read-Host "Paste PAT for $user (hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $pat = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    @"
protocol=https
host=github.com
path=vibedevops-agency/vDrop.git
username=$user
password=$pat
"@ | git credential-manager store
    $pat = $null
    Write-Host "Stored PAT for this repo path only." -ForegroundColor Green
} else {
    git credential-manager github login --browser --username vibedevops-agency --force
}

Write-Host ""
Write-Host "Push when ready: git push -u origin main" -ForegroundColor Cyan
Write-Host ""