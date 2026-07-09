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
    # Provide BOTH to register tasks with "run whether user is logged in or not"
    # persisted (stored password). Without them, tasks register interactive
    # (run only when logged on) and you must set that flag manually in Task
    # Scheduler — AND re-set it after every bootstrap run (it gets reset).
    #   e.g. -TaskUser "$env:COMPUTERNAME\trader" -TaskPassword 'secret'
    [string]$TaskUser         = "",
    [string]$TaskPassword     = "",
    [switch]$SkipPull,
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Locate Python ─────────────────────────────────────────────────────────────
# Avoid the Microsoft Store app-execution alias under
# %LOCALAPPDATA%\Microsoft\WindowsApps: it's a per-user stub that fails to
# resolve in Session 0, so scheduled tasks set to "run whether logged in or not"
# would die silently. Prefer a real interpreter; fall back to the py launcher.
if (-not $PythonExe) {
    $candidates = @(Get-Command python.exe -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
    $PythonExe = $candidates | Where-Object { $_ -notmatch '\\WindowsApps\\' } | Select-Object -First 1
    if (-not $PythonExe) {
        $py = Get-Command py.exe -ErrorAction SilentlyContinue
        if ($py) { $PythonExe = (& $py.Source -3 -c "import sys; print(sys.executable)" 2>$null) }
    }
    if (-not $PythonExe) {
        Write-Error "No real python.exe found (only the WindowsApps alias, which fails in Session 0 scheduled tasks). Install Python properly or pass -PythonExe explicitly."
        exit 1
    }
}
elseif ($PythonExe -match '\\WindowsApps\\') {
    Write-Warning "The -PythonExe you passed is the WindowsApps alias; scheduled tasks may fail in Session 0. Point it at a real python.exe."
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
        [object]$Settings,
        [string]$ExtraArgs = ""   # e.g. "--source mt5"
    )
    Remove-TaskIfExists $TaskName
    $argument = "-m $Module"
    if ($ExtraArgs) { $argument = "$argument $ExtraArgs" }
    $action = New-ScheduledTaskAction `
        -Execute $PythonExe `
        -Argument $argument `
        -WorkingDirectory $RepoDir
    $reg = @{
        TaskName = $TaskName; Action = $action; Trigger = $Trigger;
        Settings = $Settings; RunLevel = "Highest"; Force = $true
    }
    # If creds supplied, persist "run whether user is logged in or not" (stored
    # password) so a bootstrap re-run doesn't silently revert tasks to logged-on-only.
    if ($TaskUser -and $TaskPassword) {
        $reg["User"] = $TaskUser
        $reg["Password"] = $TaskPassword
    }
    Register-ScheduledTask @reg | Out-Null
    Write-Host "  Registered: $TaskName -> python $argument"
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

# ── SR Alpha (EURUSD support/resistance) — every 15 minutes ──────────────────
$srTrigger = New-ScheduledTaskTrigger -Once -At "00:00" `
    -RepetitionInterval (New-TimeSpan -Minutes 15) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$srSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 14) `
    -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScannerTask "IntelliTrade SR Alpha" "support_resistance.run_sr_alpha" $srTrigger $srSettings "--source mt5"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n=== Scheduled tasks ==="
Get-ScheduledTask -TaskName "IntelliTrade*" | Select-Object TaskName, State | Format-Table

if ($TaskUser -and $TaskPassword) {
    Write-Host "`nTasks registered with stored credentials for '$TaskUser' -> 'run whether user is logged in or not' is set and persists across bootstrap runs. No manual Task Scheduler step needed."
} else {
    Write-Host @"

MANUAL STEP — 'Run whether user is logged in or not':
  No -TaskUser/-TaskPassword given, so tasks registered as run-only-when-logged-on.
  This is the CSM-outage fix; set it, or re-run bootstrap WITH creds to persist it:
     ...\bootstrap.ps1 -SkipPull -SkipInstall -TaskUser "`$env:COMPUTERNAME\trader" -TaskPassword '<pw>'
  Manual route (must be redone after EVERY plain bootstrap run):
  1. taskschd.msc -> each IntelliTrade task -> Properties -> General
  2. Select 'Run whether user is logged in or not' -> enter the account password -> OK
"@
}

Write-Host "`nConfirm the MT5 terminal is logged in (demo account), then verify a scan:"
Write-Host "  $PythonExe -m intellitrade_scanners.scanner_h1m15"
