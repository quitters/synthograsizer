# Capture Videorama guide screenshots via headless Edge.
# Usage: powershell -File scripts/capture_videorama_guide.ps1 [shot-name] [url-path]
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$outDir = Join-Path $PSScriptRoot "..\docs\videorama-guide"
New-Item -ItemType Directory -Force $outDir | Out-Null

function Snap($name, $urlPath) {
  $out = Join-Path $outDir "$name.png"
  & $edge --headless=new --disable-gpu --hide-scrollbars `
    --window-size=1600,1000 --virtual-time-budget=8000 `
    --screenshot="$out" "http://127.0.0.1:8000$urlPath" 2>$null
  Start-Sleep 2   # Edge flushes the PNG asynchronously
  Write-Host "captured $name"
}

if ($args.Count -ge 2) { Snap $args[0] $args[1]; exit }

$prompt = [uri]::EscapeDataString("Fruit Love Island: a trashy reality dating show where anthropomorphic fruit contestants live in a tropical villa competing for love. Melodramatic confessionals, poolside dates gone wrong, and fruit love triangles, shot like a glossy modern reality TV dating series.")
Snap "01-hub"            "/"
Snap "02-new-set-form"   "/videorama/?prompt=$prompt&clips=15&preset=none&budget=200&chars=1"
Snap "03-shot-list-checkpoint" "/videorama/#project=city_pop_anomalies"
Snap "04-project-live"   "/videorama/#project=fruit_love_island"
