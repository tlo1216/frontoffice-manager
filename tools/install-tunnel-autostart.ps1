# Keeps the Secure MCP Tunnel running: registers a Windows scheduled task that
# starts tunnel-client at logon, and every few minutes restarts it if it is not
# running. Run it yourself once.
#
#   powershell -ExecutionPolicy Bypass -File tools\install-tunnel-autostart.ps1
#   powershell -ExecutionPolicy Bypass -File tools\install-tunnel-autostart.ps1 -Profile my-profile -TaskName "My tunnel"
#
# Remove it later with:
#   Unregister-ScheduledTask -TaskName "ESPN ChatGPT tunnel" -Confirm:$false
#
# The task runs as you, in your session, so it can read the key file that
# tools\set-runtime-key.ps1 locked to your account. It does not store a password.
#
# Four Windows details this works around, each of which silently breaks the
# obvious version of this script:
#
#  1. tunnel-client finds profiles by name under $HOME/.config/tunnel-client.
#     Git Bash sets HOME; PowerShell and Task Scheduler do not, so there
#     "--profile name" resolves to %APPDATA%\tunnel-client and fails with
#     "read config file ...: The system cannot find the path specified".
#     This script resolves the profile to a full path and passes --config.
#  2. Task Scheduler mangles nested quoting in an inline -Command argument, so
#     the task exits 1 with nothing logged. The task runs a launcher with -File.
#  3. Windows PowerShell 5.1 wraps a native command's stderr in an ErrorRecord,
#     so "*>&1 | Out-File" with $ErrorActionPreference = 'Stop' kills the daemon
#     on its first stderr line. tunnel-client's own --log.file writes the log.
#  4. A hidden scheduled task has no console and its process tree is torn down
#     when the action returns, so the launcher starts the daemon detached with
#     Start-Process. Each task run finishes immediately by design.

param(
  [string]$Profile  = 'espn-chatgpt',
  [string]$TaskName = 'ESPN ChatGPT tunnel',
  [string]$Exe      = "$env:LOCALAPPDATA\Programs\tunnel-client\tunnel-client.exe",
  [string]$ConfigPath,
  [int]   $CheckEveryMinutes = 5
)

if (-not (Test-Path $Exe)) {
  Write-Error "tunnel-client not found at $Exe. Pass -Exe with the right path."
  exit 1
}

if (-not $ConfigPath) {
  $candidates = @(
    (Join-Path $env:USERPROFILE ".config\tunnel-client\$Profile.yaml"),
    (Join-Path $env:APPDATA     "tunnel-client\$Profile.yaml"),
    (Join-Path $env:LOCALAPPDATA "tunnel-client\$Profile.yaml")
  )
  $ConfigPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ConfigPath -or -not (Test-Path $ConfigPath)) {
  Write-Error "Could not find the profile '$Profile'. Create it with 'tunnel-client init ...' or pass -ConfigPath to its .yaml."
  exit 1
}

$dir      = Join-Path $env:LOCALAPPDATA 'tunnel-client'
$launcher = Join-Path $dir "run-$Profile.ps1"
$log      = Join-Path $dir "run-$Profile.log"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Idempotent: starts the daemon only when it is not already up, so the keepalive
# trigger never produces a second instance for the same tunnel id.
@"
`$exe = '$Exe'
`$log = '$log'
if (Get-Process -Name 'tunnel-client' -ErrorAction SilentlyContinue) { exit 0 }
if (Test-Path `$log) { Remove-Item `$log -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath `$exe ``
  -ArgumentList 'run','--config','$ConfigPath','--log.file',`$log ``
  -WindowStyle Hidden
"@ | Set-Content -Path $launcher -Encoding UTF8

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""

$atLogon   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$keepAlive = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $CheckEveryMinutes)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew `
  -StartWhenAvailable

try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch {}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atLogon, $keepAlive) `
  -Settings $settings `
  -Description "Starts the read-only MCP tunnel for the ChatGPT connector at logon and restarts it if it stops (profile: $Profile)." | Out-Null

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Profile:   $Profile"
Write-Host "Config:    $ConfigPath"
Write-Host "Launcher:  $launcher"
Write-Host "Log:       $log"
Write-Host "Keepalive: every $CheckEveryMinutes minutes, plus at logon"
Write-Host ""
Write-Host "Start it now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Check it:      Get-Process tunnel-client"
Write-Host "Stop it:       Get-Process tunnel-client | Stop-Process -Force   (the keepalive restarts it within $CheckEveryMinutes min)"
Write-Host "Remove it:     Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
