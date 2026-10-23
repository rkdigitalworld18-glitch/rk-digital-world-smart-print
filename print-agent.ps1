# RK Digital World Smart Print Agent (Windows 11)
# Requires PowerShell 5.1+ and SumatraPDF installed on the shop laptop.
# Configure SERVER_URL, AGENT_TOKEN, and PRINTER_NAME below.
$ErrorActionPreference = "Stop"
$SERVER_URL = "https://YOUR-HOSTED-DOMAIN.example"
$AGENT_TOKEN = "REPLACE_WITH_A_LONG_RANDOM_AGENT_TOKEN"
$PRINTER_NAME = "HP Smart Tank 580-590 series" # Confirm exact name in Windows Settings > Printers & scanners
$SUMATRA = "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe"
$WORK = Join-Path $env:LOCALAPPDATA "RKDigitalWorld\PrintQueue"
New-Item -ItemType Directory -Force -Path $WORK | Out-Null

if (!(Test-Path $SUMATRA)) {
  Write-Host "SumatraPDF not found at $SUMATRA. Install it or update the path in this script." -ForegroundColor Red
  Write-Host "No jobs will be printed until the PDF viewer path is configured."
  exit 1
}
if ($SERVER_URL -match "YOUR-HOSTED-DOMAIN" -or $AGENT_TOKEN -match "REPLACE_WITH") {
  Write-Host "Edit SERVER_URL and AGENT_TOKEN in this script before running." -ForegroundColor Red
  exit 1
}
$headers = @{ Authorization = "Bearer $AGENT_TOKEN" }
Write-Host "RK Digital World Print Agent running. Press Ctrl+C to stop."
while ($true) {
  try {
    $job = Invoke-RestMethod -Method Get -Uri "$SERVER_URL/api/agent/next" -Headers $headers -TimeoutSec 30
    if ($null -eq $job -or !$job.id) { Start-Sleep -Seconds 4; continue }
    $safeName = [IO.Path]::GetFileName($job.originalName)
    $filePath = Join-Path $WORK ($job.id + "_" + $safeName)
    Invoke-WebRequest -Method Get -Uri ($SERVER_URL + $job.downloadPath) -Headers $headers -OutFile $filePath -TimeoutSec 120

    # SumatraPDF settings: paper size + fit/actual size + color mode + copies.
    # Driver support and paper names can vary; test with a non-sensitive sample first.
    $paper = switch -Regex ($job.settings.paper) {
      '^A4$' { 'A4'; break }
      '^A5$' { 'A5'; break }
      '^A3$' { 'A3'; break }
      '^Letter$' { 'Letter'; break }
      '^Legal$' { 'Legal'; break }
      default { 'A4' }
    }
    $fit = if ($job.settings.fit -eq "Actual size") { "noscale" } else { "fit" }
    $mode = if ($job.settings.color -eq "Black & White") { "monochrome" } else { "color" }
    $copies = [Math]::Max(1, [Math]::Min(20, [int]$job.settings.copies))
    $printSettings = "paper=$paper,$fit,$mode,$($copies)x"
    $args = @("-silent", "-print-to", $PRINTER_NAME, "-print-settings", $printSettings, $filePath)
    $proc = Start-Process -FilePath $SUMATRA -ArgumentList $args -Wait -PassThru
    if ($proc.ExitCode -eq 0) {
      Invoke-RestMethod -Method Post -Uri "$SERVER_URL/api/agent/complete/$($job.id)" -Headers $headers -ContentType "application/json" -Body '{"success":true,"message":"Print command submitted by Windows agent."}' | Out-Null
      Write-Host "$(Get-Date -Format T) Printed job $($job.id)"
    } else {
      $body = @{ success = $false; message = "SumatraPDF exited with code $($proc.ExitCode)" } | ConvertTo-Json -Compress
      Invoke-RestMethod -Method Post -Uri "$SERVER_URL/api/agent/complete/$($job.id)" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
      Write-Host "Print error for $($job.id)" -ForegroundColor Red
    }
    Remove-Item -LiteralPath $filePath -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host "$(Get-Date -Format T) Agent/server issue: $($_.Exception.Message)" -ForegroundColor Yellow
    Start-Sleep -Seconds 6
  }
}
