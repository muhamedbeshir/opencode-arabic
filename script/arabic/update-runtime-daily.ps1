#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Runs the Arabic runtime updater at most once every 24 hours.

.DESCRIPTION
  Registered as a logon scheduled task so a machine that boots several times a
  day still checks GitHub once. The gate lives in a stamp file rather than in
  the task trigger: Windows cannot express "at logon, at most daily", and a
  plain daily trigger would miss a machine that was off at that time.

  Everything is logged next to the stamp so a silent background run can be
  audited later: ~/.config/opencode-od/update.log

.PARAMETER Force
  Ignore the 24 hour window and update now.

.EXAMPLE
  pwsh -File script/arabic/update-runtime-daily.ps1 -Force
#>
[CmdletBinding()]
param(
  [string] $StampPath = (Join-Path $env:USERPROFILE ".config\opencode-od\update-last-run.txt"),
  [string] $Updater = (Join-Path $PSScriptRoot "update-runtime.ps1"),
  [int] $IntervalHours = 24,
  [switch] $Force
)

$log = Join-Path (Split-Path -Parent $StampPath) "update.log"

function Write-Log([string] $message) {
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  } catch {
    # Logging must never break the update attempt.
  }
}

function Get-LastRun {
  if (-not (Test-Path -LiteralPath $StampPath)) { return $null }
  $raw = Get-Content -LiteralPath $StampPath -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $raw) { return $null }
  $parsed = [datetime]::MinValue
  $styles = [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal
  if ([datetime]::TryParse($raw.Trim(), [cultureinfo]::InvariantCulture, $styles, [ref] $parsed)) { return $parsed }
  # Fall back to the file timestamp when the stamp itself is unreadable.
  return (Get-Item -LiteralPath $StampPath).LastWriteTimeUtc
}

if (-not (Test-Path -LiteralPath $Updater)) {
  Write-Log "skip: updater not found at $Updater"
  return
}

if (-not $Force) {
  $last = Get-LastRun
  if ($last) {
    $age = (Get-Date).ToUniversalTime() - $last
    if ($age.TotalHours -lt $IntervalHours) {
      Write-Log ("skip: last check {0:N1}h ago (interval {1}h)" -f $age.TotalHours, $IntervalHours)
      return
    }
  }
}

Write-Log "run: checking $Updater"
$succeeded = $false
try {
  & $Updater 2>&1 | ForEach-Object { Write-Log "  $_" }
  $succeeded = $true
  Write-Log "run: done"
} catch {
  Write-Log "error: $($_.Exception.Message)"
}

# Stamp only a completed run: a machine that logs on offline must not lose its
# next chance to update for a whole day.
if ($succeeded) {
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StampPath) | Out-Null
    (Get-Date).ToUniversalTime().ToString("o") | Set-Content -LiteralPath $StampPath
  } catch {}
}
