#requires -Version 5.1
<#
Offline-only build utility. Requires Windows System.Speech and FFmpeg/FFprobe.
Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-audio.ps1
Rebuilds only the MP3 files named by the curriculum and the eight UI prompts.
#>
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$EnglishVoice = 'Microsoft Zira Desktop',
    [string]$ChineseVoice = 'Microsoft Huihui Desktop'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$root = [IO.Path]::GetFullPath($ProjectRoot)
$curriculumPath = Join-Path $root 'public\data\curriculum.json'
$curriculum = Get-Content -LiteralPath $curriculumPath -Raw -Encoding UTF8 | ConvertFrom-Json
$audioRoot = Join-Path $root 'public\audio'
$uiRoot = Join-Path $audioRoot 'ui'
[IO.Directory]::CreateDirectory($uiRoot) | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$available = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
foreach ($name in @($EnglishVoice, $ChineseVoice)) {
    if ($available -notcontains $name) {
        throw "Required local voice is missing: $name. Installed voices: $($available -join ', ')"
    }
}
$records = [System.Collections.Generic.List[object]]::new()

function Write-SpokenClip {
    param([string]$Text, [string]$Destination, [string]$Voice, [int]$Rate)
    $wav = Join-Path ([IO.Path]::GetTempPath()) ('english-garden-' + [guid]::NewGuid().ToString('N') + '.wav')
    try {
        $synth.SelectVoice($Voice)
        $synth.Rate = $Rate
        $synth.Volume = 100
        $synth.SetOutputToWaveFile($wav)
        $synth.Speak($Text)
        $synth.SetOutputToNull()
        & $ffmpeg -hide_banner -loglevel error -y -i $wav -map_metadata -1 -af loudnorm=I=-20:TP=-1.5:LRA=7 -ac 1 -ar 24000 -c:a libmp3lame -b:a 48k -metadata "title=$Text" -metadata "comment=Offline Windows System.Speech synthesis; voice=$Voice; rate=$Rate" $Destination
        if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed for: $Destination" }
        $durationText = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $Destination
        if ($LASTEXITCODE -ne 0) { throw "FFprobe failed for: $Destination" }
        $duration = [double]::Parse(($durationText | Select-Object -First 1), [Globalization.CultureInfo]::InvariantCulture)
        if ($duration -lt 0.3 -or $duration -gt 20) { throw "Unexpected clip duration: $duration seconds, $Destination" }
        $records.Add([pscustomobject]@{
            file = $Destination.Substring($root.Length + 1).Replace('\', '/')
            text = $Text
            voice = $Voice
            rate = $Rate
            seconds = [math]::Round($duration, 3)
            bytes = (Get-Item -LiteralPath $Destination).Length
            sha256 = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
        })
    }
    finally {
        $synth.SetOutputToNull()
        if (Test-Path -LiteralPath $wav) { Remove-Item -LiteralPath $wav -Force }
    }
}

try {
    $count = 0
    foreach ($lesson in $curriculum.lessons) {
        if ($lesson.id -notmatch '^[a-z]+-[0-9]{2}$' -or $lesson.audio -ne "audio/$($lesson.id).mp3") {
            throw "Invalid or unexpected curriculum audio path for lesson $($lesson.id)"
        }
        $destination = Join-Path $audioRoot "$($lesson.id).mp3"
        Write-SpokenClip -Text $lesson.english -Destination $destination -Voice $EnglishVoice -Rate -1
        $count++
        if ($count % 10 -eq 0) { Write-Output "English audio: $count / $($curriculum.lessons.Count)" }
    }
    $prompts = [ordered]@{
        listen = '听一听，然后跟着说。'
        choose = '听一听，选一选。'
        speak = '轮到你啦！试着说一说。'
        reveal = '想不起来也没关系，我们再听一次。'
        complete = '今天的小练习完成啦！在生活里也试着说一说吧。'
        review = '还记得怎么说吗？'
        record = '点一下小话筒，录下你的声音。'
        welcome = '每天一句，一起让英语小芽长大吧。'
    }
    foreach ($item in $prompts.GetEnumerator()) {
        Write-SpokenClip -Text $item.Value -Destination (Join-Path $uiRoot "$($item.Key).mp3") -Voice $ChineseVoice -Rate 0
    }
    $manifest = [ordered]@{
        version = '1.0'
        source = 'Local Windows System.Speech.Synthesis.SpeechSynthesizer; no external API'
        encoder = 'FFmpeg loudnorm I=-20 TP=-1.5 LRA=7; libmp3lame, mono, 24000 Hz, 48 kbps'
        englishVoice = $EnglishVoice
        chineseVoice = $ChineseVoice
        lessons = $curriculum.lessons.Count
        uiPrompts = $prompts.Count
        totalBytes = ($records | Measure-Object -Property bytes -Sum).Sum
        clips = $records
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText((Join-Path $audioRoot 'manifest.json'), $manifestJson, (New-Object Text.UTF8Encoding($false)))
    Write-Output "Built $($records.Count) local audio clips; $($manifest.totalBytes) bytes total."
}
finally { $synth.Dispose() }
