#Requires -Version 5.1

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$project = [System.IO.Path]::GetFullPath($ProjectRoot)
$deployRoot = [System.IO.Path]::GetFullPath((Join-Path $project "..\\.."))
$sourceRoot = Join-Path $deployRoot "ll-lakehouse"
$ingestionSource = Join-Path $sourceRoot "ingestion"
$initSource = Join-Path $sourceRoot "init"
$cleanupSource = Join-Path $sourceRoot "prepare-custom-image.sh"
$dataTransformsOverride = Join-Path $project "02-edit-if-needed\hooks\peakgear-init\create-pg-iceberg-connection.sh"

foreach ($path in @($ingestionSource, $initSource)) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        throw "Required LiveStack source directory was not found: $path"
    }
}
if (-not (Test-Path -LiteralPath $cleanupSource -PathType Leaf)) {
    throw "Required LiveStack cleanup script was not found: $cleanupSource"
}
if (-not (Test-Path -LiteralPath $dataTransformsOverride -PathType Leaf)) {
    throw "Required Peak Gear Data Transforms override was not found: $dataTransformsOverride"
}

$dataTransformsSource = Get-Content -LiteralPath $dataTransformsOverride -Raw
$expectedIcebergProbe = 'http://127.0.0.1:${port}/iceberg/v1/config'
$invalidIcebergProbe = 'http://127.0.0.1:${port}/iceberg"'
if (-not $dataTransformsSource.Contains($expectedIcebergProbe) -or
    $dataTransformsSource.Contains($invalidIcebergProbe)) {
    throw "Peak Gear must probe /iceberg/v1/config only; the bare /iceberg catalog path is not a health endpoint."
}

# Packer reads these sibling source folders directly. Do not make a second local
# application copy: Oracle JET paths can exceed Windows' legacy path limit.
# Refuse accidental local runtime state rather than trying to strip it silently.
$runtimePaths = @(
    ".env",
    ".oci",
    "wallet",
    "logs",
    "runtime",
    "state",
    ".adb_load_done",
    ".oci_wallet_required"
)
foreach ($relativePath in $runtimePaths) {
    $runtimePath = Join-Path $ingestionSource $relativePath
    if (Test-Path -LiteralPath $runtimePath) {
        throw "Remove local runtime material before building: $runtimePath"
    }
}

Write-Host "[image-pipeline] Verified direct LiveStack ingestion and init sources without local runtime data" -ForegroundColor Cyan
