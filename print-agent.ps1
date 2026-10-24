# RK Digital World Smart Print Agent (Windows 11)
# Requires PowerShell 5.1+ and SumatraPDF installed on the shop laptop.
# Configure SERVER_URL, AGENT_TOKEN, and PRINTER_NAME below.
$ErrorActionPreference = "Stop"
$SERVER_URL = "https://YOUR-HOSTED-DOMAIN.example"
$AGENT_TOKEN = "REPLACE_WITH_A_LONG_RANDOM_AGENT_TOKEN"
$PRINTER_NAME = "HP Smart Tank 580-590 series" # Confirm exact name in Windows Settings > Printers & scanners
$SUMATRA = "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe"
$WORK = Join-Path $env:LOCALAPPDATA "RKDigitalWorld\PrintQueue"
$POLL_SECONDS = 1
$ERROR_RETRY_SECONDS = 2
$POLL_TIMEOUT_SECONDS = 30
$RASTER_DPI_HINT = 300
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
Write-Host "Queue polling: every $POLL_SECONDS second. Raster DPI hint: $RASTER_DPI_HINT (printer driver controls actual output quality)."
Write-Host "For better quality, set Windows printer Printing preferences > Paper/Quality > Best and select the paper type you actually loaded."
$lastIdleLog = Get-Date
while ($true) {
  $pollWatch = [Diagnostics.Stopwatch]::StartNew()
  try {
    $job = Invoke-RestMethod -Method Get -Uri "$SERVER_URL/api/agent/next" -Headers $headers -TimeoutSec $POLL_TIMEOUT_SECONDS
    $pollWatch.Stop()
    if ($null -eq $job -or !$job.id) {
      if (((Get-Date) - $lastIdleLog).TotalSeconds -ge 60) {
        Write-Host "$(Get-Date -Format T) Queue idle; latest poll took $([Math]::Round($pollWatch.Elapsed.TotalMilliseconds)) ms."
        $lastIdleLog = Get-Date
      }
      Start-Sleep -Seconds $POLL_SECONDS
      continue
    }

    Write-Host "$(Get-Date -Format T) Job $($job.id) received; queue poll took $([Math]::Round($pollWatch.Elapsed.TotalMilliseconds)) ms."
    $safeName = [IO.Path]::GetFileName($job.originalName)
    $filePath = Join-Path $WORK ($job.id + "_" + $safeName)

    $downloadWatch = [Diagnostics.Stopwatch]::StartNew()
    Invoke-WebRequest -Method Get -Uri ($SERVER_URL + $job.downloadPath) -Headers $headers -OutFile $filePath -TimeoutSec 120
    $downloadWatch.Stop()
    $fileInfo = Get-Item -LiteralPath $filePath
    Write-Host "$(Get-Date -Format T) Downloaded $($fileInfo.Length) bytes in $([Math]::Round($downloadWatch.Elapsed.TotalSeconds,2)) s."

    # SumatraPDF settings: paper size + fit/actual size + color mode + copies.
    # dpi=300 is an assumed raster-image DPI hint; it does NOT override a PDF's own page dimensions
    # or force the physical printer's DPI. Actual print quality is set in the Windows printer driver.
    $paper = switch -Regex ($job.settings.paper) {
      '^A4
 { 'A4'; break }
      '^A5
 { 'A5'; break }
      '^A3
 { 'A3'; break }
      '^Letter
 { 'Letter'; break }
      '^Legal
 { 'Legal'; break }
      default { 'A4' }
    }
    $fit = if ($job.settings.fit -eq "Actual size") { "noscale" } else { "fit" }
    $mode = if ($job.settings.color -eq "Black & White") { "monochrome" } else { "color" }
    $copies = [Math]::Max(1, [Math]::Min(20, [int]$job.settings.copies))
    $printSettings = "paper=$paper,$fit,dpi=$RASTER_DPI_HINT,$mode,$($copies)x"
    $args = @("-silent", "-print-to", $PRINTER_NAME, "-print-settings", $printSettings, $filePath)

    $printWatch = [Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $SUMATRA -ArgumentList $args -Wait -PassThru
    $printWatch.Stop()
    Write-Host "$(Get-Date -Format T) Sumatra/driver handoff took $([Math]::Round($printWatch.Elapsed.TotalSeconds,2)) s (exit $($proc.ExitCode))."
    if ($proc.ExitCode -eq 0) {
      Invoke-RestMethod -Method Post -Uri "$SERVER_URL/api/agent/complete/$($job.id)" -Headers $headers -ContentType "application/json" -Body '{"success":true,"message":"Print command submitted by Windows agent."}' | Out-Null
      Write-Host "$(Get-Date -Format T) Job $($job.id) submitted to Windows print queue; polling for next job now."
    } else {
      $body = @{ success = $false; message = "SumatraPDF exited with code $($proc.ExitCode)" } | ConvertTo-Json -Compress
      Invoke-RestMethod -Method Post -Uri "$SERVER_URL/api/agent/complete/$($job.id)" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
      Write-Host "Print error for $($job.id)" -ForegroundColor Red
    }
    Remove-Item -LiteralPath $filePath -Force -ErrorAction SilentlyContinue
  } catch {
    $pollWatch.Stop()
    Write-Host "$(Get-Date -Format T) Agent/server issue: $($_.Exception.Message)" -ForegroundColor Yellow
    Start-Sleep -Seconds $ERROR_RETRY_SECONDS
  }
}
