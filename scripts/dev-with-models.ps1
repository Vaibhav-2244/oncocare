$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$modelScript = Join-Path $PSScriptRoot 'start-model-service.ps1'

$modelProcess = Start-Process powershell -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', $modelScript
) -WorkingDirectory $repoRoot -PassThru

try {
  Write-Host "Cancer model service started with PID $($modelProcess.Id) on http://127.0.0.1:8001"
  npm run dev
} finally {
  if (-not $modelProcess.HasExited) {
    Stop-Process -Id $modelProcess.Id -Force
    Write-Host 'Cancer model service stopped.'
  }
}
