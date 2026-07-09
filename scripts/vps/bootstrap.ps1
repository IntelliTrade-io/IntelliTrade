# IntelliTrade VPS — git-based deploy bootstrap (plan 6.7)
#
# Replaces the old hand-copy workflow: pull the repo, (re)install the Python
# package, and (re)register the scanner + watchdog scheduled tasks so they run
# the NEW package layout (`python -m intellitrade_scanners.*`) instead of the
# flat `scanner_d1h4.py` files.
#
# ADDITIVE + IDEMPOTENT: safe to re-run. It does not touch setup_windows_tasks.ps1
# (kept as the pre-git baseline for drift reconciliation, §6.7 step 3). Once this
# script is proven on the box, setup_windows_tasks.ps1 can be retired.
#
# Prereqs (owner, one-time — see scripts/vps/DEPLOY.md):
#   - git installed on the VPS
#   - repo cloned (sparse) to $RepoDir with a read-only deploy key / PAT
#   - drift reconciled against commit 2a010de before the first run
#
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File C:\IntelliTrade\repo\scripts\vps\bootstrap.ps1
#   ...\bootstrap.ps1 -Ref main -SkipPull        # re-register tasks only
#   ...\bootstrap.ps1 -IntelliTradeHome D:\IT    # non-default home

param(
    [string]$RepoDir          = "C:\IntelliTrade\repo",
    [string]$IntelliTradeHome = "C:\IntelliTrade",
    [string]$Ref              = "main",
    [string]$PythonExe        = "",
    [switch]$SkipPull,
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Locate Python ─────────────────────────────────────────────────────────────
if (-not $PythonExe) {
    $found = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Error "Python not found in PATH. Install Python and add it to PATH, then re-run."
        exit 1
    }
    $PythonExe = $found.Source
}
Write-Host "Using Python : $PythonExe"
Write-Host "Repo         : $RepoDir"
Write-Host "Home         : $IntelliTradeHome"

if (-not (Test-Path $RepoDir)) {
    Write-Error "Repo not found at $RepoDir. Clone it first (see scripts/vps/DEPLOY.md)."
    exit 1
}

# ── Persist INTELLITRADE_HOME so scheduled tasks inherit it ───────────────────
# Only needed when non-default; harmless to set either way. Machine scope =
# visible to Task Scheduler at run time.
[Environment]::SetEnvironmentVariable("INTELLITRADE_HOME", $IntelliTradeHome, "Machine")
$env:INTELLITRADE_HOME = $IntelliTradeHome

# ── Ensure runtime directories exist ─────────────────────────────────────────
foreach ($sub in @("config", "logs", "out", "backups")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $IntelliTradeHome $sub) | Out-Null
}

# ── Pull latest code ──────────────────────────────────────────────────────────
if (-not $SkipPull) {
    Write-Host "`n== git pull ($Ref) =="
    git -C $RepoDir fetch --prune
    if ($LASTEXITCODE -ne 0) { Write-Error "git fetch failed"; exit 1 }
    git -C $RepoDir checkout $Ref
    if ($LASTEXITCODE -ne 0) { Write-Error "git checkout $Ref failed"; exit 1 }
    git -C $RepoDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Error "git pull --ff-only failed (local edits? reconcile first)"; exit 1 }
}

# ── Install / update the package (editable) with the MT5 extra ────────────────
# MT5 is Windows-only; the lockfile pins the rest. Editable so a pull is enough
# next time (no reinstall needed unless dependencies change).
if (-not $SkipInstall) {
    Write-Host "`n== pip install -e .[mt5] =="
    & $PythonExe -m pip install -e "$RepoDir[mt5]" -c (Join-Path $RepoDir "requirements-lock.txt")
    if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; exit 1 }
}

# ── Scheduled-task helpers ────────────────────────────────────────────────────
function Remove-TaskIfExists([string]$TaskName) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "  Removed existing task: $TaskName"
    }
}

function Register-ScannerTask {
    param(
        [string]$TaskName,
        [string]$Module,          # e.g. intellitrade_scanners.scanner_d1h4
        [object]$Trigger,
        [object]$Settings
    )
    Remove-TaskIfExists $TaskName
    $action = New-ScheduledTaskAction `
        -Execute $PythonExe `
        -Argument "-m $Module" `
        -WorkingDirectory $RepoDir
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $Trigger `
        -Settings $Settings `
        -RunLevel Highest `
        -Force | Out-Null
    Write-Host "  Registered: $TaskName -> python -m $Module"
}

# ── D1/H4 scanner — six daily triggers ────────────────────────────────────────
$d1h4Triggers = @(
    (New-ScheduledTaskTrigger -Daily -At "00:05"),
    (New-ScheduledTaskTrigger -Daily -At "04:05"),
    (New-ScheduledTaskTrigger -Daily -At "08:05"),
    (New-ScheduledTaskTrigger -Daily -At "12:05"),
    (New-ScheduledTaskTrigger -Daily -At "16:05"),
    (New-ScheduledTaskTrigger -Daily -At "20:05")
)
$d1h4Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScannerTask "IntelliTrade D1H4 Scanner" "intellitrade_scanners.scanner_d1h4" $d1h4Triggers $d1h4Settings

# ── H1/M15 scanner — every 15 minutes ─────────────────────────────────────────
$h1m15Trigger = New-ScheduledTaskTrigger -Once -At "00:01" `
    -RepetitionInterval (New-TimeSpan -Minutes 15) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$h1m15Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 14) `
    -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 3) `
    -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScannerTask "IntelliTrade H1M15 Scanner" "intellitrade_scanners.scanner_h1m15" $h1m15Trigger $h1m15Settings

# ── Watchdog — every 5 minutes ────────────────────────────────────────────────
$wdTrigger = New-ScheduledTaskTrigger -Once -At "00:02" `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$wdSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
    -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScannerTask "IntelliTrade Scanner Watchdog" "intellitrade_scanners.watchdog" $wdTrigger $wdSettings

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n=== Scheduled tasks ==="
Get-ScheduledTask -TaskName "IntelliTrade*" | Select-Object TaskName, State | Format-Table

Write-Host @"

MANUAL STEP (unavoidable) — 'Run whether user is logged in or not':
  This is the fix for the CSM outage (tasks currently run only when logged on).
  Task Scheduler cannot set this non-interactively without storing the password.
  1. Open Task Scheduler (taskschd.msc)
  2. For each IntelliTrade task -> Properties -> General
  3. Select 'Run whether user is logged in or not'
  4. Enter the Windows account password when prompted -> OK

Also confirm the MT5 terminal is logged in (demo account) before trusting output;
the feed froze during the outage. Run one scan manually to verify:
  $PythonExe -m intellitrade_scanners.scanner_h1m15
"@
