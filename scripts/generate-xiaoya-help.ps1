#requires -Version 5.1
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$InstallEdgeTts
)
$ErrorActionPreference = 'Stop'
# Compatibility entry. Never falls back to the rejected Windows voice.
Push-Location -LiteralPath $ProjectRoot
try {
  $EdgeEnvironment = Join-Path $ProjectRoot 'test-results/xiaoya-neural-help-20261016/edge-venv'
  $EdgePython = Join-Path $EdgeEnvironment 'Scripts/python.exe'
  if ($InstallEdgeTts) {
    if (-not (Test-Path -LiteralPath $EdgePython)) {
      & python -m venv $EdgeEnvironment
      if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated production environment.' }
    }
    & $EdgePython -m pip install --disable-pip-version-check 'edge-tts==7.3.1'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the pinned production dependency.' }
  }
  if (-not (Test-Path -LiteralPath $EdgePython)) {
    throw 'Run this script with -InstallEdgeTts once to install edge-tts 7.3.1 in test-results; user-wide Python is not changed.'
  }
  & node (Join-Path $PSScriptRoot 'xiaoya-help.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Chinese audio prompt preparation failed.' }
  & python (Join-Path $PSScriptRoot 'generate-xiaoya-help.py')
  if ($LASTEXITCODE -ne 0) { throw 'Local neural audio failed; inspect test-results/xiaoya-neural-help-20261016/generation.log.' }
  & $EdgePython (Join-Path $PSScriptRoot 'generate-xiaoya-context.py')
  if ($LASTEXITCODE -ne 0) { throw 'Neural context audio failed; inspect test-results/xiaoya-neural-help-20261016/edge-contexts/error.log.' }
  # Both source batches must finish before any new public clips are copied.
  & python (Join-Path $PSScriptRoot 'generate-xiaoya-help.py') --export
  if ($LASTEXITCODE -ne 0) { throw 'Audio publication failed; generated evidence is retained under test-results.' }
  & $EdgePython (Join-Path $PSScriptRoot 'generate-xiaoya-context.py') --export
  if ($LASTEXITCODE -ne 0) { throw 'Context publication failed; generated evidence is retained under test-results.' }
} finally { Pop-Location }
