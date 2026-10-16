#requires -Version 5.1
param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$audioDir = Join-Path $ProjectRoot 'public\xiaoya\audio'
$spec = Get-Content -LiteralPath (Join-Path $audioDir 'prompts.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($spec.voice)
$synth.Rate = 0
$synth.Volume = 100
try {
  foreach ($prompt in $spec.prompts) {
    $wavPath = Join-Path ([IO.Path]::GetTempPath()) ('xiaoya-' + [guid]::NewGuid().ToString('N') + '.wav')
    $outPath = Join-Path $audioDir ($prompt.id + '.mp3')
    try {
      $synth.SetOutputToWaveFile($wavPath)
      $synth.Speak($prompt.text)
      $synth.SetOutputToNull()
      & ffmpeg -hide_banner -loglevel error -y -i $wavPath -map_metadata -1 -af loudnorm=I=-20:TP=-1.5:LRA=7 -ac 1 -ar 24000 -c:a libmp3lame -b:a 48k $outPath
      if ($LASTEXITCODE -ne 0) { throw "Audio conversion failed: $($prompt.id)" }
    } finally { $synth.SetOutputToNull(); if (Test-Path -LiteralPath $wavPath) { Remove-Item -LiteralPath $wavPath } }
  }
  Write-Output "Created $($spec.prompts.Count) Chinese voice prompts."
} finally { $synth.Dispose() }
