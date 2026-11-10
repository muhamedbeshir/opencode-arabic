#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Pulls the newest Arabic build from GitHub and swaps it into the local runtime.

.DESCRIPTION
  The `Arabic Build` workflow publishes every successful `arabic` build to the
  rolling release tag `arabic-latest`. This script downloads that binary,
  compares it with the one currently installed, keeps a timestamped backup and
  replaces the runtime used by the opencode-arabic launcher.

  Close OpenCode before running: Windows locks a running .exe and the swap fails.

.EXAMPLE
  pwsh -File script/arabic/update-runtime.ps1
  pwsh -File script/arabic/update-runtime.ps1 -Force
#>
[CmdletBinding()]
param(
  [string] $Repo = "muhamedbeshir/opencode-arabic",
  [string] $Tag = "arabic-latest",
  [string] $RuntimePath = (Join-Path $env:USERPROFILE ".config\opencode-od\runtime\opencode-arabic.exe"),
  [int] $KeepBackups = 3,
  [switch] $Force
)

$ErrorActionPreference = "Stop"
$asset = "opencode-arabic-windows-x64.exe"
$url = "https://github.com/$Repo/releases/download/$Tag/$asset"

function Get-BinaryVersion([string] $path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { return ((& $path --version 2>$null) -join " ").Trim() } catch { return $null }
}

Write-Host "==> Runtime : $RuntimePath"
$current = Get-BinaryVersion $RuntimePath
Write-Host "==> Installed: $(if ($current) { $current } else { '(none)' })"

$tmp = Join-Path ([IO.Path]::GetTempPath()) "opencode-arabic-$([guid]::NewGuid().ToString('N').Substring(0,8)).exe"
Write-Host "==> Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing

$incoming = Get-BinaryVersion $tmp
if (-not $incoming) {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  throw "The downloaded file did not run as an OpenCode binary. Aborting without touching the runtime."
}
Write-Host "==> Downloaded: $incoming"

if ($incoming -eq $current -and -not $Force) {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  Write-Host "==> Already up to date. Nothing to do (use -Force to reinstall)."
  return
}

if (Test-Path -LiteralPath $RuntimePath) {
  $backup = "$RuntimePath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $RuntimePath -Destination $backup -Force
  Write-Host "==> Backup   : $(Split-Path -Leaf $backup)"
}

try {
  Move-Item -LiteralPath $tmp -Destination $RuntimePath -Force
} catch {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  throw "Could not replace the runtime - OpenCode is probably still running. Close it and run this again."
}

Write-Host "==> Installed: $(Get-BinaryVersion $RuntimePath)"

# Keep only the newest backups so this script never becomes the disk-hog it cleans up.
Get-ChildItem -LiteralPath (Split-Path -Parent $RuntimePath) -Filter "opencode-arabic.exe.bak-*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepBackups |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "==> Pruned old backup: $($_.Name)"
  }

Write-Host "==> Done."
