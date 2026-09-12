# Stores an OpenAI runtime API key for the Secure MCP Tunnel in a file only your
# Windows user can read. Run it yourself in a PowerShell window. The key is typed
# hidden and is never echoed, logged, committed, or shown to the agent.
#
#   powershell -ExecutionPolicy Bypass -File tools\set-runtime-key.ps1
#   powershell -ExecutionPolicy Bypass -File tools\set-runtime-key.ps1 -Name my-tunnel
#
# Then point the tunnel profile at it:
#   --control-plane-api-key-ref "file:%LOCALAPPDATA%\tunnel-client\secrets\<name>.key"

param([string]$Name = 'espn-chatgpt')

$dir  = Join-Path $env:LOCALAPPDATA 'tunnel-client\secrets'
$file = Join-Path $dir "$Name.key"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$secure = Read-Host -AsSecureString "Paste the OpenAI runtime API key (sk-...) for tunnel '$Name'"
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($plain)) { Write-Error 'Nothing entered. Nothing saved.'; exit 1 }
if (-not $plain.Trim().StartsWith('sk-')) {
  Write-Error 'That does not look like an OpenAI API key (expected it to start with sk-). Nothing saved.'
  exit 1
}

[IO.File]::WriteAllText($file, $plain.Trim(), [Text.UTF8Encoding]::new($false))
$plain = $null
[GC]::Collect()

# Break inheritance and grant only the current user.
icacls $file /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

Write-Host ""
Write-Host "Saved to $file"
Write-Host "Readable by $env:USERNAME only. Not in the repo, not in git."
Write-Host "Profile reference:  file:$file"
