# Keeps the Secure MCP Tunnel running: registers a Windows scheduled task that
# starts tunnel-client at logon and restarts it if it dies. Run it yourself once.
#
#   powershell -ExecutionPolicy Bypass -File tools\install-tunnel-autostart.ps1
#   powershell -ExecutionPolicy Bypass -File tools\install-tunnel-autostart.ps1 -Profile my-profile -TaskName "My tunnel"
#
# Remove it later with:
#   Unregister-ScheduledTask -TaskName "ESPN ChatGPT tunnel" -Confirm:$false
#
# The task runs as you, in your session, so it can read the key file that
# tools\set-runtime-key.ps1 locked to your account. It does not store a password.

param(
  [string]$Profile  = 'espn-chatgpt',
  [string]$TaskName = 'ESPN ChatGPT tunnel',
  [string]$Exe      = "$env:LOCALAPPDATA\Programs\tunnel-client\tunnel-client.exe"
)

if (-not (Test-Path $Exe)) {
  Write-Error "tunnel-client not found at $Exe. Pass -Exe with the right path."
  exit 1
}

$arg = "-NoProfile -WindowStyle Hidden -Command `"& '$Exe' run --profile $Profile`""
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch {}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Keeps the read-only MCP tunnel up for the ChatGPT connector (profile: $Profile)." | Out-Null

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Profile: $Profile"
Write-Host ""
Write-Host "Only one tunnel-client instance per tunnel ID. Stop any you started by hand, then:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Check it:   Get-ScheduledTask -TaskName '$TaskName' | Select TaskName,State"
Write-Host "Stop it:    Stop-ScheduledTask  -TaskName '$TaskName'"
Write-Host "Remove it:  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
