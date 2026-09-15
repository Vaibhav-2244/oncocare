$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$modelRoot = Join-Path $repoRoot 'cancer_predictions_models'
$python = Join-Path $modelRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
  throw "Model Python environment not found at $python. Create it and install cancer_predictions_models/unified_cancer_model/requirements.txt."
}

Push-Location $modelRoot
try {
  & $python -m uvicorn unified_cancer_model.service:app --host 127.0.0.1 --port 8001
} finally {
  Pop-Location
}
