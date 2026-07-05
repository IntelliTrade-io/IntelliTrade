# IntelliTrade Scanner — Windows Scheduled Tasks Setup
# Run this script as Administrator on the VPS.
# Prereqs: Python in PATH, scanner files at C:\IntelliTrade\scanner\

param(
    [string]$ScannerDir = "C:\IntelliTrade\scanner",
    [string]$LogDir     = "C:\IntelliTrade\logs",
    [string]$PythonExe  = ""
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
Write-Host "Using Python: $PythonExe"

# ── Ensure directories exist ──────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $ScannerDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir     | Out-Null
New-Item -ItemType Directory -Force -Path "C:\IntelliTrade\logs"   | Out-Null
New-Item -ItemType Directory -Force -Path "C:\IntelliTrade\out"    | Out-Null
New-Item -ItemType Directory -Force -Path "C:\IntelliTrade\config" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\IntelliTrade\backups"| Out-Null

# ── Helper: remove old task if it exists ─────────────────────────────────────
function Remove-TaskIfExists([string]$TaskName) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "  Removed existing task: $TaskName"
    }
}

# ── D1/H4 Scanner — every 4 hours starting 00:05 ────────────────────────────
Write-Host "`nCreating: IntelliTrade D1H4 Scanner"
Remove-TaskIfExists "IntelliTrade D1H4 Scanner"

$d1h4Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "scanner_d1h4.py" `
    -WorkingDirectory $ScannerDir

# Six daily triggers: 00:05, 04:05, 08:05, 12:05, 16:05, 20:05
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
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName "IntelliTrade D1H4 Scanner" `
    -Action $d1h4Action `
    -Trigger $d1h4Triggers `
    -Settings $d1h4Settings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  Created: IntelliTrade D1H4 Scanner (00:05 / 04:05 / 08:05 / 12:05 / 16:05 / 20:05)"

# ── H1/M15 Scanner — every 15 minutes ────────────────────────────────────────
Write-Host "`nCreating: IntelliTrade H1M15 Scanner"
Remove-TaskIfExists "IntelliTrade H1M15 Scanner"

$h1m15Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "scanner_h1m15.py" `
    -WorkingDirectory $ScannerDir

# One trigger with 15-minute repetition (9999 days ≈ indefinite)
$h1m15TriggerBase = New-ScheduledTaskTrigger -Once -At "00:01" `
    -RepetitionInterval (New-TimeSpan -Minutes 15) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$h1m15Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 14) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 3) `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName "IntelliTrade H1M15 Scanner" `
    -Action $h1m15Action `
    -Trigger $h1m15TriggerBase `
    -Settings $h1m15Settings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  Created: IntelliTrade H1M15 Scanner (every 15 minutes)"

# ── Watchdog — every 5 minutes ────────────────────────────────────────────────
Write-Host "`nCreating: IntelliTrade Scanner Watchdog"
Remove-TaskIfExists "IntelliTrade Scanner Watchdog"

$wdAction = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "watchdog.py" `
    -WorkingDirectory $ScannerDir

$wdTriggerBase = New-ScheduledTaskTrigger -Once -At "00:02" `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$wdSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName "IntelliTrade Scanner Watchdog" `
    -Action $wdAction `
    -Trigger $wdTriggerBase `
    -Settings $wdSettings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "  Created: IntelliTrade Scanner Watchdog (every 5 minutes)"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n=== Scheduled tasks created ==="
Get-ScheduledTask -TaskName "IntelliTrade*" | Select-Object TaskName, State | Format-Table

Write-Host @"

IMPORTANT — set 'Run whether user is logged in or not':
  1. Open Task Scheduler (taskschd.msc)
  2. For each IntelliTrade task → Properties → General
  3. Select 'Run whether user is logged in or not'
  4. Enter your Windows password when prompted
  5. Click OK

This keeps scanners running after RDP disconnect.
"@
