#Requires -Version 5.1

[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$')]
    [string]$ImageName = "web-jupyter",
    [string]$PackerVariableFile = "",
    [string]$TerraformDirectory = "",
    [string]$TerraformVariableFile = "",
    [string]$MarketplaceAttestationFile = "",
    [string]$SshPrivateKeyPath = "",
    [ValidateRange(60, 7200)]
    [int]$WaitSeconds = 1800,
    [switch]$ValidateOnly,
    [switch]$KeepTestResources,
    [switch]$PrepareManualCapture,
    [string]$ResumeManualCaptureInstance = "",
    [string]$ExistingImageOcid = "",
    [switch]$InspectionMode,
    [string]$CleanupInspection = "",
    [string]$CleanupFailedTest = "",
    [string]$ShowInspectionInfo = "",
    [switch]$ApproveForMarketplace
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PipelineStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$PackerRoot = $PSScriptRoot
$ManifestPath = Join-Path $PackerRoot "packer-manifest.json"
$AutomationDirectory = Join-Path $ProjectRoot ".automation"
$ManualCaptureReceiptPath = Join-Path $AutomationDirectory "manual-image-capture.json"
$ReadyReceiptPath = Join-Path $AutomationDirectory "ready-for-marketplace.json"
$ReadyReceiptLockPath = Join-Path $AutomationDirectory "ready-for-marketplace.lock"
$DefaultMarketplaceAttestationPath = Join-Path (Join-Path $ProjectRoot "01-edit") "marketplace-attestation.json"
$ReadyReceiptKind = "oci-custom-image-marketplace-handoff"
$ReadyReceiptCorePropertyNames = @(
    "schema_version",
    "kind",
    "release_id",
    "image_name",
    "image_ocid",
    "region",
    "automated_test_status",
    "reboot_test_status",
    "cleanup_status",
    "inspection_id",
    "inspection_status",
    "created_utc",
    "updated_utc",
    "automated_test_completed_utc",
    "reboot_test_completed_utc",
    "cleanup_completed_utc",
    "inspection_started_utc",
    "inspection_completed_utc",
    "inspection_approved_utc"
)
$ReadyReceiptPropertyNames = @($ReadyReceiptCorePropertyNames + "attestation")
$ApprovedKmsSigningAlgorithm = "SHA_256_RSA_PKCS_PSS"
$script:ReadyReceiptLockHandle = $null
$script:ReadyReceiptLockToken = ""

if ($InspectionMode -and ($ValidateOnly -or $KeepTestResources -or -not [string]::IsNullOrWhiteSpace($CleanupInspection))) {
    throw "InspectionMode cannot be combined with ValidateOnly, KeepTestResources, or CleanupInspection."
}
if (-not [string]::IsNullOrWhiteSpace($ExistingImageOcid) -and
    $ExistingImageOcid -cnotmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
    throw "ExistingImageOcid must be a complete custom image OCID."
}
if ($InspectionMode -and [string]::IsNullOrWhiteSpace($ExistingImageOcid)) {
    throw "InspectionMode requires a complete ExistingImageOcid."
}
if (-not [string]::IsNullOrWhiteSpace($ExistingImageOcid) -and
    ($ValidateOnly -or $KeepTestResources -or $PrepareManualCapture)) {
    throw "ExistingImageOcid cannot be combined with ValidateOnly, KeepTestResources, or PrepareManualCapture."
}
if ($PrepareManualCapture -and
    ($ValidateOnly -or $KeepTestResources -or $InspectionMode -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or $ApproveForMarketplace)) {
    throw "PrepareManualCapture cannot be combined with validation, testing, inspection, cleanup, or approval modes."
}
if (-not [string]::IsNullOrWhiteSpace($ResumeManualCaptureInstance) -and
    ($ValidateOnly -or $KeepTestResources -or $PrepareManualCapture -or $InspectionMode -or
        -not [string]::IsNullOrWhiteSpace($ExistingImageOcid) -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or
        -not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -or $ApproveForMarketplace)) {
    throw "ResumeManualCaptureInstance cannot be combined with build, test, inspection, cleanup, or approval modes."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupInspection) -and
    ($ValidateOnly -or $KeepTestResources -or -not [string]::IsNullOrWhiteSpace($ExistingImageOcid))) {
    throw "CleanupInspection cannot be combined with ValidateOnly, KeepTestResources, or ExistingImageOcid."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupInspection) -and $CleanupInspection -cnotmatch '^inspection-[0-9]{14}-[0-9]+$') {
    throw "CleanupInspection must use the generated inspection-YYYYMMDDHHMMSS-PID format."
}
if (-not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -and
    $ShowInspectionInfo -cnotmatch '^inspection-[0-9]{14}-[0-9]+$') {
    throw "ShowInspectionInfo must use the generated inspection-YYYYMMDDHHMMSS-PID format."
}
if (-not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -and
    ($ValidateOnly -or $KeepTestResources -or $PrepareManualCapture -or $InspectionMode -or
        -not [string]::IsNullOrWhiteSpace($ExistingImageOcid) -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or $ApproveForMarketplace)) {
    throw "ShowInspectionInfo cannot be combined with build, test, inspection, cleanup, or approval modes."
}
if ($ApproveForMarketplace -and [string]::IsNullOrWhiteSpace($CleanupInspection) -and
    ($ValidateOnly -or $KeepTestResources -or $PrepareManualCapture -or $InspectionMode -or
        -not [string]::IsNullOrWhiteSpace($ExistingImageOcid))) {
    throw "Standalone ApproveForMarketplace cannot be combined with build, test, or inspection modes."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupFailedTest) -and
    ($ValidateOnly -or $KeepTestResources -or $PrepareManualCapture -or $InspectionMode -or
        -not [string]::IsNullOrWhiteSpace($ExistingImageOcid) -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or
        -not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -or $ApproveForMarketplace)) {
    throw "CleanupFailedTest cannot be combined with build, test, inspection, Marketplace approval, or other cleanup modes."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupFailedTest) -and
    $CleanupFailedTest -cnotmatch '^packer-test-[0-9]{14}-[0-9]+$') {
    throw "CleanupFailedTest must use the generated packer-test-YYYYMMDDHHMMSS-PID format."
}

function Write-Step {
    param([string]$Message)
    Write-Host "[image-pipeline] $Message" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "[image-pipeline] PASS: $Message" -ForegroundColor Green
}

function Format-ElapsedTime {
    param([TimeSpan]$Elapsed)

    $hours = [Math]::Floor($Elapsed.TotalHours)
    return "{0:00}h {1:00}m {2:00}s" -f $hours, $Elapsed.Minutes, $Elapsed.Seconds
}

function Get-UtcTimestamp {
    return [DateTime]::UtcNow.ToString("o", [System.Globalization.CultureInfo]::InvariantCulture)
}

function Test-UtcTimestamp {
    param(
        [string]$Value,
        [switch]$AllowEmpty
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $AllowEmpty.IsPresent
    }
    if (-not $Value.EndsWith("Z", [StringComparison]::Ordinal)) {
        return $false
    }

    $parsed = [DateTimeOffset]::MinValue
    return [DateTimeOffset]::TryParse(
        $Value,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind,
        [ref]$parsed
    ) -and $parsed.Offset -eq [TimeSpan]::Zero
}

function Test-ExactIntegerValue {
    param(
        [object]$Value,
        [long]$Expected
    )

    $integerTypes = @(
        [byte],
        [sbyte],
        [int16],
        [uint16],
        [int32],
        [uint32],
        [int64],
        [uint64]
    )
    $isInteger = $false
    foreach ($integerType in $integerTypes) {
        if ($Value -is $integerType) {
            $isInteger = $true
            break
        }
    }
    return $isInteger -and [decimal]$Value -eq [decimal]$Expected
}

function Test-OrdinalStringEquals {
    param(
        [object]$Value,
        [string]$Expected
    )

    return $Value -is [string] -and
        [string]::Equals([string]$Value, $Expected, [StringComparison]::Ordinal)
}

function Test-OrdinalStringInSet {
    param(
        [object]$Value,
        [string[]]$Allowed
    )

    if ($Value -isnot [string]) {
        return $false
    }
    foreach ($candidate in $Allowed) {
        if ([string]::Equals([string]$Value, $candidate, [StringComparison]::Ordinal)) {
            return $true
        }
    }
    return $false
}

function Get-ReadyReceiptPayloadBytes {
    param([object]$Receipt)

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($propertyName in $ReadyReceiptCorePropertyNames) {
        $property = $Receipt.PSObject.Properties[$propertyName]
        if ($null -eq $property) {
            throw "Ready-for-Marketplace receipt is missing $propertyName."
        }
        if ($propertyName -eq "schema_version") {
            if (-not (Test-ExactIntegerValue -Value $property.Value -Expected 2)) {
                throw "Ready-for-Marketplace receipt schema_version must be the integer 2."
            }
            $value = "2"
        }
        else {
            if ($property.Value -isnot [string]) {
                throw "Ready-for-Marketplace receipt $propertyName must be a string."
            }
            $value = [string]$property.Value
        }
        if ($value.IndexOfAny([char[]]@("`r", "`n", [char]0)) -ge 0) {
            throw "Ready-for-Marketplace receipt $propertyName contains unsupported control characters."
        }
        $lines.Add(("{0}={1}" -f $propertyName, $value))
    }
    $payload = ($lines -join "`n") + "`n"
    return [System.Text.Encoding]::UTF8.GetBytes($payload)
}

function Get-Sha256Digest {
    param([byte[]]$Bytes)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return $sha256.ComputeHash($Bytes)
    }
    finally {
        $sha256.Dispose()
    }
}

function ConvertTo-LowerHex {
    param([byte[]]$Bytes)
    return ([System.BitConverter]::ToString($Bytes)).Replace("-", "").ToLowerInvariant()
}

function Assert-ReadyForMarketplaceReceipt {
    param([object]$Receipt)

    if ($null -eq $Receipt) {
        throw "Ready-for-Marketplace receipt is empty."
    }

    $actualProperties = @($Receipt.PSObject.Properties.Name | Sort-Object)
    $expectedProperties = @($ReadyReceiptPropertyNames | Sort-Object)
    $propertyDifference = @(Compare-Object -ReferenceObject $expectedProperties -DifferenceObject $actualProperties)
    if ($propertyDifference.Count -ne 0) {
        throw "Ready-for-Marketplace receipt contains missing or unsupported fields."
    }

    if (-not (Test-ExactIntegerValue -Value $Receipt.schema_version -Expected 2)) {
        throw "Ready-for-Marketplace receipt schema_version must be the integer 2."
    }
    foreach ($propertyName in @($ReadyReceiptCorePropertyNames | Where-Object { $_ -ne "schema_version" })) {
        if ($Receipt.PSObject.Properties[$propertyName].Value -isnot [string]) {
            throw "Ready-for-Marketplace receipt $propertyName must be a string."
        }
    }
    if (-not (Test-OrdinalStringEquals -Value $Receipt.kind -Expected $ReadyReceiptKind)) {
        throw "Ready-for-Marketplace receipt kind is invalid."
    }
    if ([string]$Receipt.release_id -cnotmatch '^release-[0-9]{14}-[a-f0-9]{12}$') {
        throw "Ready-for-Marketplace receipt release_id is invalid."
    }
    if ([string]$Receipt.image_name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$') {
        throw "Ready-for-Marketplace receipt image_name is invalid."
    }
    if ([string]$Receipt.image_ocid -cnotmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Ready-for-Marketplace receipt image_ocid is invalid."
    }
    if ([string]$Receipt.region -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)+-[0-9]+$') {
        throw "Ready-for-Marketplace receipt region is invalid."
    }

    foreach ($statusName in @("automated_test_status", "reboot_test_status", "cleanup_status")) {
        if (-not (Test-OrdinalStringEquals -Value $Receipt.$statusName -Expected "passed")) {
            throw "Ready-for-Marketplace receipt $statusName must be passed."
        }
    }

    $inspectionStatus = [string]$Receipt.inspection_status
    if (-not (Test-OrdinalStringInSet `
            -Value $Receipt.inspection_status `
            -Allowed @("pending", "deployed", "cleaned_not_approved", "approved"))) {
        throw "Ready-for-Marketplace receipt inspection_status is invalid."
    }

    foreach ($requiredTimestamp in @(
            "created_utc",
            "updated_utc",
            "automated_test_completed_utc",
            "reboot_test_completed_utc",
            "cleanup_completed_utc"
        )) {
        if (-not (Test-UtcTimestamp -Value ([string]$Receipt.$requiredTimestamp))) {
            throw "Ready-for-Marketplace receipt $requiredTimestamp is not a valid UTC timestamp."
        }
    }
    foreach ($optionalTimestamp in @(
            "inspection_started_utc",
            "inspection_completed_utc",
            "inspection_approved_utc"
        )) {
        if (-not (Test-UtcTimestamp -Value ([string]$Receipt.$optionalTimestamp) -AllowEmpty)) {
            throw "Ready-for-Marketplace receipt $optionalTimestamp is not empty or a valid UTC timestamp."
        }
    }

    $orderedTimestampNames = @(
        "created_utc",
        "automated_test_completed_utc",
        "reboot_test_completed_utc",
        "cleanup_completed_utc",
        "inspection_started_utc",
        "inspection_completed_utc",
        "inspection_approved_utc",
        "updated_utc"
    )
    $previousTimestamp = $null
    $previousTimestampName = ""
    foreach ($timestampName in $orderedTimestampNames) {
        $timestampText = [string]$Receipt.$timestampName
        if ([string]::IsNullOrWhiteSpace($timestampText)) {
            continue
        }

        $timestamp = [DateTimeOffset]::Parse(
            $timestampText,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::RoundtripKind
        ).ToUniversalTime()
        if ($null -ne $previousTimestamp -and $timestamp -lt $previousTimestamp) {
            throw "Ready-for-Marketplace receipt timestamps are out of order: $timestampName is earlier than $previousTimestampName."
        }
        $previousTimestamp = $timestamp
        $previousTimestampName = $timestampName
    }

    $inspectionId = [string]$Receipt.inspection_id
    switch ($inspectionStatus) {
        "pending" {
            if (-not [string]::IsNullOrWhiteSpace($inspectionId) -or
                -not [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_started_utc) -or
                -not [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_completed_utc) -or
                -not [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_approved_utc)) {
                throw "A pending Ready-for-Marketplace receipt cannot contain inspection details."
            }
        }
        "deployed" {
            if ($inspectionId -cnotmatch '^inspection-[0-9]{14}-[0-9]+$' -or
                [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_started_utc) -or
                -not [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_completed_utc) -or
                -not [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_approved_utc)) {
                throw "A deployed Ready-for-Marketplace receipt has inconsistent inspection details."
            }
        }
        "cleaned_not_approved" {
            if ($inspectionId -cnotmatch '^inspection-[0-9]{14}-[0-9]+$' -or
                [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_started_utc) -or
                [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_completed_utc) -or
                -not [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_approved_utc)) {
                throw "A cleaned Ready-for-Marketplace receipt has inconsistent inspection details."
            }
        }
        "approved" {
            if ($inspectionId -cnotmatch '^inspection-[0-9]{14}-[0-9]+$' -or
                [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_started_utc) -or
                [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_completed_utc) -or
                [string]::IsNullOrWhiteSpace([string]$Receipt.inspection_approved_utc)) {
                throw "An approved Ready-for-Marketplace receipt has inconsistent inspection details."
            }
        }
    }

    if (-not (Test-OrdinalStringEquals -Value $inspectionStatus -Expected "approved")) {
        if ($null -ne $Receipt.attestation) {
            throw "An unapproved Ready-for-Marketplace receipt cannot contain an attestation."
        }
        return
    }

    if ($null -eq $Receipt.attestation) {
        throw "An approved Ready-for-Marketplace receipt must contain a KMS attestation."
    }
    $attestationProperties = @($Receipt.attestation.PSObject.Properties.Name | Sort-Object)
    $expectedAttestationProperties = @(
        "digest_algorithm",
        "key_id",
        "key_version_id",
        "payload_sha256",
        "signature",
        "signing_algorithm",
        "type"
    ) | Sort-Object
    if (@(Compare-Object -ReferenceObject $expectedAttestationProperties -DifferenceObject $attestationProperties).Count -ne 0) {
        throw "Ready-for-Marketplace receipt attestation contains missing or unsupported fields."
    }
    foreach ($propertyName in $expectedAttestationProperties) {
        if ($Receipt.attestation.PSObject.Properties[$propertyName].Value -isnot [string]) {
            throw "Ready-for-Marketplace receipt attestation $propertyName must be a string."
        }
    }
    if (-not (Test-OrdinalStringEquals `
            -Value $Receipt.attestation.type `
            -Expected "oci-kms-asymmetric-signature") -or
        -not (Test-OrdinalStringEquals `
            -Value $Receipt.attestation.digest_algorithm `
            -Expected "SHA-256")) {
        throw "Ready-for-Marketplace receipt attestation type or digest algorithm is invalid."
    }
    if ([string]$Receipt.attestation.key_id -cnotmatch '^ocid1\.key\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        [string]$Receipt.attestation.key_version_id -cnotmatch '^ocid1\.keyversion\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Ready-for-Marketplace receipt attestation contains invalid KMS key OCIDs."
    }
    if (-not (Test-OrdinalStringEquals `
            -Value $Receipt.attestation.signing_algorithm `
            -Expected $ApprovedKmsSigningAlgorithm)) {
        throw "Ready-for-Marketplace receipt attestation signing algorithm is not approved."
    }
    $payloadDigest = Get-Sha256Digest -Bytes (Get-ReadyReceiptPayloadBytes -Receipt $Receipt)
    $payloadHex = ConvertTo-LowerHex -Bytes $payloadDigest
    if (-not [string]::Equals(
            [string]$Receipt.attestation.payload_sha256,
            $payloadHex,
            [StringComparison]::OrdinalIgnoreCase
        )) {
        throw "Ready-for-Marketplace receipt content does not match its attested digest."
    }
    if ([string]$Receipt.attestation.signature -cnotmatch '\A[A-Za-z0-9+/]+={0,2}\z') {
        throw "Ready-for-Marketplace receipt attestation signature is not strict base64."
    }
    try {
        $signatureBytes = [Convert]::FromBase64String([string]$Receipt.attestation.signature)
    }
    catch {
        throw "Ready-for-Marketplace receipt attestation signature is not valid base64."
    }
    if ($signatureBytes.Length -lt 64 -or $signatureBytes.Length -gt 2048) {
        throw "Ready-for-Marketplace receipt attestation signature has an invalid size."
    }
}

function Read-ReadyForMarketplaceReceipt {
    param(
        [string]$Path,
        [switch]$Required
    )

    Assert-ReadyReceiptLockHeld
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Required) {
            throw "Ready-for-Marketplace receipt was not found: $Path"
        }
        return $null
    }
    Assert-NotReparsePoint -Path $Path -Label "Ready-for-Marketplace receipt"

    try {
        $receipt = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        throw "Ready-for-Marketplace receipt is not valid JSON: $Path"
    }

    Assert-ReadyForMarketplaceReceipt -Receipt $receipt
    return $receipt
}

function Write-ReadyForMarketplaceReceipt {
    param(
        [string]$Path,
        [object]$Receipt
    )

    Assert-ReadyReceiptLockHeld
    Assert-ReadyForMarketplaceReceipt -Receipt $Receipt

    $directory = Split-Path -Parent $Path
    Assert-NotReparsePoint `
        -Path $directory `
        -Label "Ready-for-Marketplace automation directory" `
        -AllowMissing
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Assert-NotReparsePoint -Path $directory -Label "Ready-for-Marketplace automation directory"
    Assert-NotReparsePoint -Path $Path -Label "Ready-for-Marketplace receipt" -AllowMissing
    $temporaryPath = ""
    $temporaryStream = $null
    $backupPath = ""
    $backupStream = $null
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

    try {
        $json = ($Receipt | ConvertTo-Json -Depth 4) + [Environment]::NewLine
        $jsonBytes = $utf8WithoutBom.GetBytes($json)
        for ($attempt = 0; $attempt -lt 32; $attempt++) {
            $candidatePath = Join-Path $directory (
                ".{0}.{1}.tmp" -f (Split-Path -Leaf $Path), [System.IO.Path]::GetRandomFileName()
            )
            Assert-NotReparsePoint `
                -Path $candidatePath `
                -Label "Ready-for-Marketplace temporary receipt" `
                -AllowMissing
            try {
                $temporaryStream = New-Object System.IO.FileStream(
                    $candidatePath,
                    [System.IO.FileMode]::CreateNew,
                    [System.IO.FileAccess]::Write,
                    [System.IO.FileShare]::None
                )
                $temporaryPath = $candidatePath
                break
            }
            catch [System.IO.IOException] {
                $temporaryStream = $null
            }
        }
        if ($null -eq $temporaryStream -or [string]::IsNullOrWhiteSpace($temporaryPath)) {
            throw "Could not create an exclusive temporary file for the Ready-for-Marketplace receipt."
        }
        $temporaryStream.Write($jsonBytes, 0, $jsonBytes.Length)
        $temporaryStream.Flush()
        $temporaryStream.Dispose()
        $temporaryStream = $null
        Assert-NotReparsePoint -Path $temporaryPath -Label "Ready-for-Marketplace temporary receipt"

        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            Assert-NotReparsePoint -Path $Path -Label "Ready-for-Marketplace receipt"
            for ($attempt = 0; $attempt -lt 32; $attempt++) {
                $candidateBackupPath = Join-Path $directory (
                    ".{0}.{1}.bak" -f (Split-Path -Leaf $Path), [System.IO.Path]::GetRandomFileName()
                )
                Assert-NotReparsePoint `
                    -Path $candidateBackupPath `
                    -Label "Ready-for-Marketplace backup receipt" `
                    -AllowMissing
                try {
                    $backupStream = New-Object System.IO.FileStream(
                        $candidateBackupPath,
                        [System.IO.FileMode]::CreateNew,
                        [System.IO.FileAccess]::Write,
                        [System.IO.FileShare]::None
                    )
                    $backupPath = $candidateBackupPath
                    break
                }
                catch [System.IO.IOException] {
                    $backupStream = $null
                }
            }
            if ($null -eq $backupStream -or [string]::IsNullOrWhiteSpace($backupPath)) {
                throw "Could not create an exclusive temporary backup for the Ready-for-Marketplace receipt."
            }
            $backupStream.Dispose()
            $backupStream = $null
            Assert-NotReparsePoint -Path $backupPath -Label "Ready-for-Marketplace backup receipt"
            [System.IO.File]::Replace($temporaryPath, $Path, $backupPath, $true)
            Remove-Item -LiteralPath $backupPath -Force
            $backupPath = ""
        }
        else {
            [System.IO.File]::Move($temporaryPath, $Path)
        }
        $temporaryPath = ""
    }
    finally {
        if ($null -ne $temporaryStream) {
            $temporaryStream.Dispose()
        }
        if ($null -ne $backupStream) {
            $backupStream.Dispose()
        }
        if (-not [string]::IsNullOrWhiteSpace($temporaryPath)) {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        }
        if (-not [string]::IsNullOrWhiteSpace($backupPath)) {
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Remove-ReadyForMarketplaceReceipt {
    param([string]$Path)

    Assert-ReadyReceiptLockHeld
    Assert-NotReparsePoint -Path $Path -Label "Ready-for-Marketplace receipt" -AllowMissing
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Ready-for-Marketplace receipt path is not a regular file: $Path"
    }
    Remove-Item -LiteralPath $Path -Force
    if (Test-Path -LiteralPath $Path) {
        throw "Previous Ready-for-Marketplace receipt could not be invalidated."
    }
}

function New-ReadyForMarketplaceReceipt {
    param(
        [string]$Name,
        [string]$ImageOcid,
        [string]$Region
    )

    $completedUtc = Get-UtcTimestamp
    return [pscustomobject][ordered]@{
        schema_version               = 2
        kind                         = $ReadyReceiptKind
        release_id                   = "release-{0}-{1}" -f [DateTime]::UtcNow.ToString("yyyyMMddHHmmss"), [Guid]::NewGuid().ToString("N").Substring(0, 12)
        image_name                   = $Name
        image_ocid                   = $ImageOcid
        region                       = $Region
        automated_test_status        = "passed"
        reboot_test_status           = "passed"
        cleanup_status               = "passed"
        inspection_id                = ""
        inspection_status            = "pending"
        created_utc                  = $completedUtc
        updated_utc                  = $completedUtc
        automated_test_completed_utc = $completedUtc
        reboot_test_completed_utc    = $completedUtc
        cleanup_completed_utc        = $completedUtc
        inspection_started_utc       = ""
        inspection_completed_utc     = ""
        inspection_approved_utc      = ""
        attestation                  = $null
    }
}

function Get-DisposableInspectionContext {
    param(
        [string]$Path,
        [string]$InspectionId
    )

    Assert-NotReparsePoint -Path $Path -Label "Disposable inspection receipt"
    try {
        $receipt = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        throw "Disposable inspection receipt is not valid JSON: $Path"
    }

    if (-not (Test-ExactIntegerValue -Value $receipt.schema_version -Expected 1) -or
        -not (Test-OrdinalStringEquals -Value $receipt.inspection_id -Expected $InspectionId) -or
        -not (Test-OrdinalStringEquals -Value $receipt.workspace_name -Expected $InspectionId) -or
        -not (Test-OrdinalStringEquals -Value $receipt.status -Expected "ready")) {
        throw "Disposable inspection receipt does not match inspection '$InspectionId'."
    }

    $imageOcid = [string]$receipt.image_ocid
    if ($imageOcid -notmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Disposable inspection receipt contains an invalid image OCID."
    }
    $publicIp = [string]$receipt.public_ip
    $parsedPublicIp = [System.Net.IPAddress]::None
    if (-not [System.Net.IPAddress]::TryParse($publicIp, [ref]$parsedPublicIp) -or
        $parsedPublicIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw "Disposable inspection receipt does not contain a ready VM IPv4 address."
    }

    $snapshotFileName = [string]$receipt.variable_snapshot
    if ([string]::IsNullOrWhiteSpace($snapshotFileName) -or
        [System.IO.Path]::GetFileName($snapshotFileName) -ne $snapshotFileName) {
        throw "Disposable inspection receipt contains an invalid variable snapshot name."
    }

    $automationDirectory = Split-Path -Parent $Path
    $snapshotPath = Resolve-ExistingFile `
        -Path (Join-Path $automationDirectory $snapshotFileName) `
        -Label "Inspection variable snapshot"

    return [pscustomobject]@{
        ImageOcid = $imageOcid
        VariableSnapshotPath = $snapshotPath
    }
}

function Write-InspectionCleanupCommands {
    param([string]$InspectionId)

    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        Write-Host "Windows recovery command to show the login information again:" -ForegroundColor Yellow
        Write-Host ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -ShowInspectionInfo `"{0}`"" -f $InspectionId)
        Write-Host "Windows cleanup-only command (run from this project folder):" -ForegroundColor Yellow
        Write-Host ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -CleanupInspection `"{0}`"" -f $InspectionId)
        Write-Host "Windows cleanup-and-approval command (run only after approving the inspection):" -ForegroundColor Yellow
        Write-Host ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -CleanupInspection `"{0}`" -ApproveForMarketplace" -f $InspectionId)
    }
    else {
        Write-Host "Linux/macOS recovery command to show the login information again:" -ForegroundColor Yellow
        Write-Host ("bash ./03-automation/build-and-test.sh -ShowInspectionInfo `"{0}`"" -f $InspectionId)
        Write-Host "Linux/macOS cleanup-only command (run from this project folder):" -ForegroundColor Yellow
        Write-Host ("bash ./03-automation/build-and-test.sh -CleanupInspection `"{0}`"" -f $InspectionId)
        Write-Host "Linux/macOS cleanup-and-approval command (run only after approving the inspection):" -ForegroundColor Yellow
        Write-Host ("bash ./03-automation/build-and-test.sh -CleanupInspection `"{0}`" -ApproveForMarketplace" -f $InspectionId)
    }
}

function Assert-PathComponentsNotReparse {
    param(
        [string]$Path,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label path was not provided."
    }

    $currentPath = [System.IO.Path]::GetFullPath($Path)
    while (-not [string]::IsNullOrWhiteSpace($currentPath)) {
        if (Test-Path -LiteralPath $currentPath) {
            $item = Get-Item -LiteralPath $currentPath -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "$Label must not traverse a symbolic link, junction, or reparse point: $currentPath"
            }
        }

        $parent = [System.IO.Directory]::GetParent($currentPath)
        if ($null -eq $parent) {
            break
        }
        $currentPath = $parent.FullName
    }
}

function Assert-NotReparsePoint {
    param(
        [string]$Path,
        [string]$Label,
        [switch]$AllowMissing
    )

    Assert-PathComponentsNotReparse -Path $Path -Label $Label
    if (-not (Test-Path -LiteralPath $Path)) {
        if ($AllowMissing) {
            return
        }
        throw "$Label does not exist: $Path"
    }
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label must not be a symbolic link, junction, or reparse point: $Path"
    }
}

function Assert-ReadyReceiptLockHeld {
    if ($null -eq $script:ReadyReceiptLockHandle -or
        $script:ReadyReceiptLockHandle.SafeFileHandle.IsClosed -or
        -not (Test-Path -LiteralPath $ReadyReceiptLockPath -PathType Leaf)) {
        throw "Ready-for-Marketplace receipt access requires the project receipt lock."
    }
}

function Enter-ReadyReceiptLock {
    if ($null -ne $script:ReadyReceiptLockHandle) {
        throw "Ready-for-Marketplace receipt lock is already held by this process."
    }

    Assert-NotReparsePoint `
        -Path $AutomationDirectory `
        -Label "Ready-for-Marketplace automation directory" `
        -AllowMissing
    New-Item -ItemType Directory -Path $AutomationDirectory -Force | Out-Null
    Assert-NotReparsePoint `
        -Path $AutomationDirectory `
        -Label "Ready-for-Marketplace automation directory"
    Assert-NotReparsePoint `
        -Path $ReadyReceiptLockPath `
        -Label "Ready-for-Marketplace receipt lock" `
        -AllowMissing

    $lockToken = [Guid]::NewGuid().ToString("N")
    $lockHandle = $null
    try {
        $lockHandle = New-Object System.IO.FileStream(
            $ReadyReceiptLockPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
    }
    catch [System.IO.IOException] {
        throw @"
Ready-for-Marketplace receipt lock already exists or is active:
$ReadyReceiptLockPath
Another build, inspection, cleanup, or approval may still be running. Do not delete the lock while a process is active. If every related process has stopped, inspect and remove this stale lock manually, then rerun.
"@
    }

    try {
        $lockMetadata = [ordered]@{
            schema_version = 1
            token = $lockToken
            process_id = $PID
            host = [Environment]::MachineName
            created_utc = Get-UtcTimestamp
        }
        $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
        $lockBytes = $utf8WithoutBom.GetBytes(
            (($lockMetadata | ConvertTo-Json -Depth 2 -Compress) + [Environment]::NewLine)
        )
        $lockHandle.Write($lockBytes, 0, $lockBytes.Length)
        $lockHandle.Flush()
        $script:ReadyReceiptLockToken = $lockToken
        $script:ReadyReceiptLockHandle = $lockHandle
    }
    catch {
        if ($null -ne $lockHandle) {
            $lockHandle.Dispose()
        }
        Remove-Item -LiteralPath $ReadyReceiptLockPath -Force -ErrorAction SilentlyContinue
        throw
    }
}

function Exit-ReadyReceiptLock {
    if ($null -eq $script:ReadyReceiptLockHandle) {
        return
    }

    $expectedToken = $script:ReadyReceiptLockToken
    $script:ReadyReceiptLockHandle.Dispose()
    $script:ReadyReceiptLockHandle = $null
    $script:ReadyReceiptLockToken = ""

    Assert-NotReparsePoint `
        -Path $ReadyReceiptLockPath `
        -Label "Ready-for-Marketplace receipt lock"
    try {
        $lockMetadata = Get-Content -LiteralPath $ReadyReceiptLockPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Ready-for-Marketplace receipt lock could not be validated during release. Remove it manually only after confirming no related process is running: $ReadyReceiptLockPath"
    }
    if (-not (Test-OrdinalStringEquals -Value $lockMetadata.token -Expected $expectedToken)) {
        throw "Ready-for-Marketplace receipt lock changed while held. It was not removed: $ReadyReceiptLockPath"
    }

    Remove-Item -LiteralPath $ReadyReceiptLockPath -Force
    if (Test-Path -LiteralPath $ReadyReceiptLockPath) {
        throw "Ready-for-Marketplace receipt lock could not be removed. Remove it manually only after confirming no related process is running: $ReadyReceiptLockPath"
    }
}

function Resolve-ExistingFile {
    param(
        [string]$Path,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label was not provided."
    }

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
    if ($null -eq $resolved -or -not (Test-Path -LiteralPath $resolved.Path -PathType Leaf)) {
        throw "$Label does not exist: $Path"
    }
    Assert-NotReparsePoint -Path $Path -Label $Label
    Assert-NotReparsePoint -Path $resolved.Path -Label $Label

    return $resolved.Path
}

function Resolve-ExistingDirectory {
    param(
        [string]$Path,
        [string]$Label
    )

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
    if ($null -eq $resolved -or -not (Test-Path -LiteralPath $resolved.Path -PathType Container)) {
        throw "$Label does not exist: $Path"
    }
    Assert-NotReparsePoint -Path $Path -Label $Label
    Assert-NotReparsePoint -Path $resolved.Path -Label $Label

    return $resolved.Path
}

function Resolve-CommandPath {
    param([string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "Required command is not installed or not on PATH: $Name"
    }

    return $command.Source
}

function Resolve-ApplicationPath {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            return $command.Source
        }
    }

    throw "Required application is not installed or not on PATH: $($Names -join ', ')"
}

function Format-Command {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    $displayArguments = New-Object System.Collections.Generic.List[string]
    $redactNext = $false
    foreach ($argument in $Arguments) {
        if ($redactNext) {
            $displayArguments.Add("<redacted>")
            $redactNext = $false
            continue
        }
        if ($argument -in @("--config-file", "--from-json", "-i", "--message", "--signature")) {
            $displayArguments.Add($argument)
            $redactNext = $true
            continue
        }
        if ($argument -like "-var-file=*") {
            $displayArguments.Add("-var-file=<ignored-local-file>")
            continue
        }
        if ($argument -match '\s') {
            $displayArguments.Add(('"{0}"' -f $argument))
        }
        else {
            $displayArguments.Add($argument)
        }
    }
    return ((Split-Path -Leaf $FilePath) + " " + ($displayArguments -join " ")).Trim()
}

function Invoke-NativeCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$CaptureOutput
    )

    Write-Step (Format-Command -FilePath $FilePath -Arguments $Arguments)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        if ($CaptureOutput) {
            $commandOutput = @(& $FilePath @Arguments 2>&1)
        }
        else {
            & $FilePath @Arguments
            $commandOutput = @()
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
        if ($CaptureOutput -and $commandOutput.Count -gt 0) {
            throw "Command failed with exit code ${exitCode}: $($commandOutput -join [Environment]::NewLine)"
        }
        throw "Command failed with exit code ${exitCode}: $(Format-Command -FilePath $FilePath -Arguments $Arguments)"
    }

    if ($CaptureOutput) {
        return (($commandOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
    }
}

function ConvertTo-ProcessArgument {
    param([string]$Value)

    if ($null -eq $Value -or $Value.Length -eq 0) {
        return '""'
    }
    if ($Value.IndexOfAny([char[]]@("`r", "`n", [char]0, '"')) -ge 0) {
        throw "Native process argument contains unsupported control characters or quotes."
    }
    if ($Value -notmatch '\s') {
        return $Value
    }

    $trailingBackslashes = [regex]::Match($Value, '\\+$').Value.Length
    if ($trailingBackslashes -gt 0) {
        $Value += ('\' * $trailingBackslashes)
    }
    return '"' + $Value + '"'
}

function Invoke-NativeCommandSeparatedOutput {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$OperationLabel = "Native command"
    )

    Write-Step (Format-Command -FilePath $FilePath -Arguments $Arguments)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $argumentListProperty = $startInfo.GetType().GetProperty("ArgumentList")
    if ($null -ne $argumentListProperty) {
        $argumentList = $argumentListProperty.GetValue($startInfo, $null)
        foreach ($argument in $Arguments) {
            [void]$argumentList.Add($argument)
        }
    }
    else {
        $startInfo.Arguments = (@(
                $Arguments | ForEach-Object { ConvertTo-ProcessArgument -Value $_ }
            ) -join " ")
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw "$OperationLabel could not be started."
        }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdoutText = $stdoutTask.GetAwaiter().GetResult()
        $stderrText = $stderrTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }

    if ($exitCode -ne 0) {
        throw "$OperationLabel failed with exit code $exitCode. Diagnostic output was suppressed because it may contain sensitive values. Review the OCI CLI configuration in a secure terminal, then rerun."
    }
    if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
        Write-Warning "$OperationLabel emitted diagnostic output; its content was suppressed so signing material and local paths are not printed."
    }
    return $stdoutText.Trim()
}

function Get-AssignmentValue {
    param(
        [string]$Path,
        [string]$Name
    )

    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*=\s*"([^"]*)"'
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch '^\s*#' -and $line -match $pattern) {
            return $Matches[1]
        }
    }

    return ""
}

function Get-OpenSshPublicKeyIdentity {
    param([string]$Value)

    $match = [regex]::Match(
        $Value.Trim(),
        '^(?<type>ssh-(?:rsa|ed25519)|ecdsa-sha2-[A-Za-z0-9-]+)\s+(?<key>[A-Za-z0-9+/=]+)'
    )
    if (-not $match.Success) {
        return ""
    }
    return "$($match.Groups['type'].Value) $($match.Groups['key'].Value)"
}

function Resolve-ManualCaptureSshAccess {
    param(
        [string]$TerraformVariablesPath,
        [string]$RequestedPrivateKeyPath
    )

    $expectedIdentity = Get-OpenSshPublicKeyIdentity `
        -Value (Get-AssignmentValue -Path $TerraformVariablesPath -Name "resUserPublicKey")
    if ([string]::IsNullOrWhiteSpace($expectedIdentity)) {
        throw "Terraform variable resUserPublicKey must contain a valid OpenSSH public key before manual capture can enable temporary SSH access."
    }

    $candidates = New-Object System.Collections.Generic.List[object]
    if (-not [string]::IsNullOrWhiteSpace($RequestedPrivateKeyPath)) {
        $privatePath = Resolve-ExistingFile -Path $RequestedPrivateKeyPath -Label "Manual-capture SSH private key"
        $publicPath = Resolve-ExistingFile -Path ("{0}.pub" -f $privatePath) -Label "Manual-capture SSH public key"
        $publicKey = (Get-Content -LiteralPath $publicPath -Raw).Trim()
        if (-not [string]::Equals(
                (Get-OpenSshPublicKeyIdentity -Value $publicKey),
                $expectedIdentity,
                [StringComparison]::Ordinal
            )) {
            throw "SshPrivateKeyPath does not match resUserPublicKey in $TerraformVariablesPath."
        }
        return [pscustomobject]@{ PrivateKeyPath = $privatePath; PublicKey = $publicKey }
    }

    $sshDirectory = Join-Path $HOME ".ssh"
    if (-not (Test-Path -LiteralPath $sshDirectory -PathType Container)) {
        throw "Could not find $sshDirectory. Pass -SshPrivateKeyPath with the private key that matches resUserPublicKey."
    }
    foreach ($publicFile in Get-ChildItem -LiteralPath $sshDirectory -File -Force | Where-Object { $_.Name.EndsWith(".pub", [StringComparison]::OrdinalIgnoreCase) }) {
        $privatePath = $publicFile.FullName.Substring(0, $publicFile.FullName.Length - 4)
        if (-not (Test-Path -LiteralPath $privatePath -PathType Leaf)) {
            continue
        }
        $publicKey = (Get-Content -LiteralPath $publicFile.FullName -Raw).Trim()
        if ([string]::Equals(
                (Get-OpenSshPublicKeyIdentity -Value $publicKey),
                $expectedIdentity,
                [StringComparison]::Ordinal
            )) {
            $candidates.Add([pscustomobject]@{ PrivateKeyPath = $privatePath; PublicKey = $publicKey })
        }
    }

    if ($candidates.Count -eq 0) {
        throw "No private key under $sshDirectory matches resUserPublicKey. Pass -SshPrivateKeyPath with the matching private key."
    }
    if ($candidates.Count -ne 1) {
        throw "More than one private key under $sshDirectory matches resUserPublicKey. Pass -SshPrivateKeyPath explicitly."
    }
    return $candidates[0]
}

function Get-HclStringListValue {
    param(
        [string]$Path,
        [string]$Name
    )

    $content = Get-Content -LiteralPath $Path -Raw
    $pattern = '(?ms)^\s*' + [regex]::Escape($Name) + '\s*=\s*\[(.*?)\]'
    $assignment = [regex]::Match($content, $pattern)
    if (-not $assignment.Success) {
        return @()
    }

    return @([regex]::Matches($assignment.Groups[1].Value, '"([^"]*)"') |
        ForEach-Object { $_.Groups[1].Value })
}

function Test-FullyQualifiedContainerImage {
    param([string]$Reference)

    if ([string]::IsNullOrWhiteSpace($Reference)) {
        return $false
    }

    $resolvedReference = $Reference.Trim()
    if ($resolvedReference -match '^\$\{(?<name>[A-Za-z_][A-Za-z0-9_]*):-(?<fallback>.+)\}$') {
        $override = [Environment]::GetEnvironmentVariable($Matches['name'])
        $resolvedReference = if ([string]::IsNullOrWhiteSpace($override)) {
            $Matches['fallback']
        }
        else {
            $override
        }
    }
    elseif ($resolvedReference.StartsWith('$')) {
        return $false
    }

    if ($resolvedReference -notmatch '^([^/]+)/.+$') {
        return $false
    }

    $registry = $Matches[1]
    return $registry -eq "localhost" -or $registry.Contains('.') -or $registry.Contains(':')
}

function Get-ContainerImageMatchValue {
    param([System.Text.RegularExpressions.Match]$Match)

    foreach ($index in 1..3) {
        if (-not [string]::IsNullOrWhiteSpace($Match.Groups[$index].Value)) {
            return $Match.Groups[$index].Value.Trim()
        }
    }
    return ""
}

function Confirm-FullyQualifiedContainerImages {
    param([string]$Root)

    $references = @()
    $deployRoot = [System.IO.Path]::GetFullPath((Join-Path $Root "..\.."))
    $composePath = Join-Path (Join-Path (Join-Path $deployRoot "ll-lakehouse") "ingestion") "compose.yml"
    $composePattern = '^\s*image:\s*(?:"([^"]+)"|''([^'']+)''|([^#\s]+))'
    foreach ($line in Get-Content -LiteralPath $composePath) {
        $match = [regex]::Match($line, $composePattern)
        if ($match.Success) {
            $references += [pscustomobject]@{
                Reference = Get-ContainerImageMatchValue -Match $match
                Source = "ll-lakehouse/ingestion/compose.yml"
            }
        }
    }

    $hooksDirectory = Join-Path (Join-Path $Root "02-edit-if-needed") "hooks"
    $assignmentPattern = '^\s*(?:local\s+)?[A-Za-z_][A-Za-z0-9_]*_image\s*=\s*(?:"([^"]+)"|''([^'']+)''|([^#\s]+))'
    foreach ($hook in Get-ChildItem -LiteralPath $hooksDirectory -Filter "*.sh" -File) {
        foreach ($line in Get-Content -LiteralPath $hook.FullName) {
            $match = [regex]::Match($line, $assignmentPattern)
            if ($match.Success) {
                $references += [pscustomobject]@{
                    Reference = Get-ContainerImageMatchValue -Match $match
                    Source = "02-edit-if-needed/hooks/$($hook.Name)"
                }
            }
        }
    }

    $invalid = @($references | Where-Object {
        -not (Test-FullyQualifiedContainerImage -Reference $_.Reference)
    })
    if ($invalid.Count -gt 0) {
        $details = ($invalid | ForEach-Object { "$($_.Reference) in $($_.Source)" }) -join "; "
        throw "Container image references must include an explicit registry such as docker.io or quay.io. Fix: $details. No OCI resources were created."
    }

    Write-Pass "Container image references use explicit registries"
}

function Confirm-ServiceCatalog {
    param([string]$Root)

    $deployRoot = [System.IO.Path]::GetFullPath((Join-Path $Root "..\.."))
    $composePath = Join-Path (Join-Path (Join-Path $deployRoot "ll-lakehouse") "ingestion") "compose.yml"
    $catalogPath = Join-Path (Join-Path $Root "01-edit") "service-catalog.json"
    $composeServices = @()
    $insideServices = $false
    foreach ($line in Get-Content -LiteralPath $composePath) {
        if ($line -match '^services:\s*$') {
            $insideServices = $true
            continue
        }
        if ($insideServices -and $line -match '^[^\s#]') {
            break
        }
        if ($insideServices -and $line -match '^  ([A-Za-z0-9][A-Za-z0-9_.-]*):\s*$') {
            $composeServices += $Matches[1]
        }
    }
    if ($composeServices.Count -eq 0) {
        throw "Compose does not declare any services: $composePath"
    }

    try {
        $catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Service catalog is not valid JSON: $catalogPath"
    }
    $services = @($catalog.services)
    if ($services.Count -eq 0) {
        throw "Service catalog must contain at least one service: $catalogPath"
    }

    $catalogIds = @()
    $oneShotIds = @()
    foreach ($service in $services) {
        $id = [string]$service.id
        if ($id -notmatch '^[a-z][a-z0-9_-]{0,63}$' -or $id -eq "dashboard") {
            throw "Service catalog contains an invalid or reserved service id: $id"
        }
        if ([string]::IsNullOrWhiteSpace([string]$service.name) -or
            [string]::IsNullOrWhiteSpace([string]$service.kind) -or
            [string]::IsNullOrWhiteSpace([string]$service.health.type)) {
            throw "Service catalog entry '$id' must define name, kind, and health.type."
        }
        $lifecycle = if ($null -ne $service.PSObject.Properties["lifecycle"]) {
            [string]$service.lifecycle
        }
        else { "" }
        if (-not [string]::IsNullOrWhiteSpace($lifecycle) -and $lifecycle -ne "oneshot") {
            throw "Service catalog entry '$id' has unsupported lifecycle '$lifecycle'. Use 'oneshot' or omit lifecycle."
        }
        if ($lifecycle -eq "oneshot") {
            $oneShotIds += $id
        }
        foreach ($credential in @($service.credentials)) {
            $metadataKey = if ($null -ne $credential.PSObject.Properties["metadata_key"]) {
                [string]$credential.metadata_key
            }
            else { "" }
            $literalValue = if ($null -ne $credential.PSObject.Properties["value"]) {
                [string]$credential.value
            }
            else { "" }
            if ([string]::IsNullOrWhiteSpace([string]$credential.label) -or
                ([string]::IsNullOrWhiteSpace($metadataKey) -eq [string]::IsNullOrWhiteSpace($literalValue))) {
                throw "Each credential for '$id' must define a label and exactly one of metadata_key or value."
            }
            if ([bool]$credential.secret -and [string]::IsNullOrWhiteSpace($metadataKey)) {
                throw "Secret dashboard credentials must come from OCI metadata: $id"
            }
        }
        $catalogIds += $id
    }

    if (@($catalogIds | Sort-Object -Unique).Count -ne $catalogIds.Count) {
        throw "Service catalog ids must be unique."
    }
    $missing = @($composeServices | Where-Object { $catalogIds -notcontains $_ })
    $extra = @($catalogIds | Where-Object { $composeServices -notcontains $_ })
    if ($missing.Count -gt 0 -or $extra.Count -gt 0) {
        throw "Service catalog must match Compose services. Missing: $($missing -join ', '). Extra: $($extra -join ', ')."
    }
    if ($oneShotIds.Count -gt 0) {
        $serviceTestDirectory = Join-Path (Join-Path $Root "02-edit-if-needed") "service-tests"
        $serviceTests = @(Get-ChildItem -LiteralPath $serviceTestDirectory -Filter "*.sh" -File -ErrorAction SilentlyContinue)
        if ($serviceTests.Count -eq 0) {
            throw "One-shot services require a functional service test under 02-edit-if-needed/service-tests: $($oneShotIds -join ', ')."
        }
    }

    Write-Pass "Service catalog covers every application Compose service"
}

function Resolve-ConfigurationPath {
    param(
        [string]$Path,
        [string]$BaseDirectory
    )

    if ($Path -eq "~") {
        return $HOME
    }
    if ($Path.StartsWith("~/") -or $Path.StartsWith("~\")) {
        $relativePath = $Path.Substring(2).Replace('/', [System.IO.Path]::DirectorySeparatorChar).Replace('\', [System.IO.Path]::DirectorySeparatorChar)
        return [System.IO.Path]::GetFullPath((Join-Path $HOME $relativePath))
    }
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BaseDirectory $Path))
}

function Get-IniValue {
    param(
        [string]$Path,
        [string]$Section,
        [string]$Name
    )

    $currentSection = ""
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^\[([^]]+)\]$') {
            $currentSection = $Matches[1]
            continue
        }
        if ($currentSection -eq $Section -and $trimmed -match ('^' + [regex]::Escape($Name) + '\s*=\s*(.+)$')) {
            return $Matches[1].Trim().Trim('"')
        }
    }

    return ""
}

function Add-SecurityTokenTarget {
    param(
        [object[]]$Targets,
        [string]$ConfigFile,
        [string]$Profile,
        [string]$Region
    )

    $securityTokenFile = Get-IniValue -Path $ConfigFile -Section $Profile -Name "security_token_file"
    if ([string]::IsNullOrWhiteSpace($securityTokenFile)) {
        return @($Targets)
    }

    $exists = @($Targets | Where-Object {
        $_.ConfigFile -eq $ConfigFile -and $_.Profile -eq $Profile
    }).Count -gt 0
    if (-not $exists) {
        $Targets += [pscustomobject]@{
            ConfigFile = $ConfigFile
            Profile = $Profile
            Region = $Region
        }
    }

    return @($Targets)
}

function Refresh-SecurityTokenTargets {
    param([object[]]$Targets)

    if ($Targets.Count -eq 0) {
        return
    }

    $ociPath = Resolve-CommandPath -Name "oci"
    foreach ($target in $Targets) {
        try {
            Invoke-NativeCommand -FilePath $ociPath -Arguments @(
                "session", "refresh",
                "--profile", $target.Profile,
                "--config-file", $target.ConfigFile
            )
            Invoke-NativeCommand -FilePath $ociPath -Arguments @(
                "session", "validate",
                "--profile", $target.Profile,
                "--config-file", $target.ConfigFile
            )
        }
        catch {
            throw "OCI security-token profile '$($target.Profile)' is not refreshable. Run: oci session authenticate --profile-name $($target.Profile) --region $($target.Region) --config-file `"$($target.ConfigFile)`""
        }
        Write-Pass "OCI security-token profile '$($target.Profile)' was refreshed"
    }
}

function Get-OciCliCommonArguments {
    param(
        [string]$ConfigFile,
        [string]$Profile,
        [string]$Region,
        [string]$Auth = ""
    )

    $arguments = @(
        "--profile", $Profile,
        "--config-file", $ConfigFile,
        "--region", $Region
    )
    $securityTokenFile = Get-IniValue -Path $ConfigFile -Section $Profile -Name "security_token_file"
    if ($Auth -eq "security_token" -and [string]::IsNullOrWhiteSpace($securityTokenFile)) {
        throw "OCI profile '$Profile' does not contain a security_token_file."
    }
    if ($Auth -eq "security_token" -or
        ([string]::IsNullOrWhiteSpace($Auth) -and -not [string]::IsNullOrWhiteSpace($securityTokenFile))) {
        $arguments += @("--auth", "security_token")
    }

    return @($arguments)
}

function Get-ObjectPropertyValue {
    param(
        [object]$Object,
        [string[]]$Names
    )

    if ($null -eq $Object) {
        return $null
    }
    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -ne $property) {
            return $property.Value
        }
    }
    return $null
}

function Assert-OciKmsCryptoEndpoint {
    param([string]$Endpoint)

    $uri = $null
    if (-not [Uri]::TryCreate($Endpoint, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne "https" -or
        -not [string]::IsNullOrWhiteSpace($uri.UserInfo) -or
        (-not $uri.IsDefaultPort -and $uri.Port -ne 443) -or
        $uri.AbsolutePath -notin @("", "/") -or
        -not [string]::IsNullOrWhiteSpace($uri.Query) -or
        -not [string]::IsNullOrWhiteSpace($uri.Fragment) -or
        $uri.DnsSafeHost -notmatch '-crypto\.kms\.' -or
        -not $uri.DnsSafeHost.EndsWith(".oraclecloud.com", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Marketplace attestation crypto_endpoint must be a direct HTTPS OCI KMS crypto endpoint under oraclecloud.com."
    }

    return "https://$($uri.DnsSafeHost.ToLowerInvariant())"
}

function Read-MarketplaceAttestationConfiguration {
    param([string]$Path)

    $resolvedPath = Resolve-ExistingFile -Path $Path -Label "Marketplace attestation configuration"
    try {
        $configuration = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Marketplace attestation configuration is not valid JSON: $resolvedPath"
    }

    $expectedProperties = @(
        "auth",
        "config_file",
        "crypto_endpoint",
        "key_ocid",
        "profile",
        "region",
        "schema_version",
        "signing_algorithm"
    ) | Sort-Object
    $actualProperties = @($configuration.PSObject.Properties.Name | Sort-Object)
    $propertyDifference = @(Compare-Object -ReferenceObject $expectedProperties -DifferenceObject $actualProperties)
    if ($propertyDifference.Count -ne 0) {
        throw "Marketplace attestation configuration contains missing or unsupported fields."
    }
    if (-not (Test-ExactIntegerValue -Value $configuration.schema_version -Expected 1)) {
        throw "Marketplace attestation configuration schema_version must be the integer 1."
    }
    foreach ($propertyName in @($expectedProperties | Where-Object { $_ -ne "schema_version" })) {
        if ($configuration.PSObject.Properties[$propertyName].Value -isnot [string]) {
            throw "Marketplace attestation configuration $propertyName must be a string."
        }
    }
    if ([string]$configuration.profile -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') {
        throw "Marketplace attestation profile is invalid."
    }
    if (-not (Test-OrdinalStringInSet `
            -Value $configuration.auth `
            -Allowed @("api_key", "security_token"))) {
        throw "Marketplace attestation auth must be api_key or security_token."
    }
    if ([string]$configuration.region -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)+-[0-9]+$') {
        throw "Marketplace attestation region is invalid."
    }
    if ([string]$configuration.key_ocid -cnotmatch '^ocid1\.key\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Marketplace attestation key_ocid must be a complete OCI Vault key OCID."
    }
    if (-not (Test-OrdinalStringEquals `
            -Value $configuration.signing_algorithm `
            -Expected $ApprovedKmsSigningAlgorithm)) {
        throw "Marketplace attestation signing_algorithm must be $ApprovedKmsSigningAlgorithm."
    }

    $configFilePath = Resolve-ConfigurationPath `
        -Path ([string]$configuration.config_file) `
        -BaseDirectory (Split-Path -Parent $resolvedPath)
    $configFilePath = Resolve-ExistingFile -Path $configFilePath -Label "Marketplace attestation OCI configuration file"
    return [pscustomobject]@{
        ConfigFile = $configFilePath
        Profile = [string]$configuration.profile
        Auth = [string]$configuration.auth
        Region = [string]$configuration.region
        CryptoEndpoint = Assert-OciKmsCryptoEndpoint -Endpoint ([string]$configuration.crypto_endpoint)
        KeyOcid = [string]$configuration.key_ocid
        SigningAlgorithm = [string]$configuration.signing_algorithm
    }
}

function New-KmsReceiptAttestation {
    param(
        [object]$Receipt,
        [object]$Configuration
    )

    if ($Configuration.Auth -eq "security_token") {
        $targets = @(Add-SecurityTokenTarget `
            -Targets @() `
            -ConfigFile $Configuration.ConfigFile `
            -Profile $Configuration.Profile `
            -Region $Configuration.Region)
        Refresh-SecurityTokenTargets -Targets $targets
    }

    $payloadDigest = Get-Sha256Digest -Bytes (Get-ReadyReceiptPayloadBytes -Receipt $Receipt)
    $payloadHex = ConvertTo-LowerHex -Bytes $payloadDigest
    $message = [Convert]::ToBase64String($payloadDigest)
    $ociPath = Resolve-CommandPath -Name "oci"
    $arguments = @(
        "kms", "crypto", "signed-data", "sign",
        "--endpoint", $Configuration.CryptoEndpoint,
        "--key-id", $Configuration.KeyOcid,
        "--message", $message,
        "--message-type", "DIGEST",
        "--signing-algorithm", $Configuration.SigningAlgorithm
    )
    $arguments += @(Get-OciCliCommonArguments `
        -ConfigFile $Configuration.ConfigFile `
        -Profile $Configuration.Profile `
        -Region $Configuration.Region `
        -Auth $Configuration.Auth)
    $arguments += @("--output", "json")
    $responseText = Invoke-NativeCommandSeparatedOutput `
        -FilePath $ociPath `
        -Arguments $arguments `
        -OperationLabel "OCI KMS receipt signing"
    try {
        $response = $responseText | ConvertFrom-Json
    }
    catch {
        throw "OCI KMS signing response was not valid JSON."
    }
    $data = Get-ObjectPropertyValue -Object $response -Names @("data")
    if ($null -eq $data) {
        $data = $response
    }
    $keyIdValue = Get-ObjectPropertyValue -Object $data -Names @("key-id", "keyId", "key_id")
    $keyVersionIdValue = Get-ObjectPropertyValue -Object $data -Names @("key-version-id", "keyVersionId", "key_version_id")
    $signatureValue = Get-ObjectPropertyValue -Object $data -Names @("signature")
    $algorithmValue = Get-ObjectPropertyValue -Object $data -Names @("signing-algorithm", "signingAlgorithm", "signing_algorithm")
    foreach ($responseField in @(
            @{ Name = "key_id"; Value = $keyIdValue },
            @{ Name = "key_version_id"; Value = $keyVersionIdValue },
            @{ Name = "signature"; Value = $signatureValue },
            @{ Name = "signing_algorithm"; Value = $algorithmValue }
        )) {
        if ($responseField.Value -isnot [string]) {
            throw "OCI KMS signing response $($responseField.Name) must be a string."
        }
    }
    $keyId = [string]$keyIdValue
    $keyVersionId = [string]$keyVersionIdValue
    $signature = [string]$signatureValue
    $algorithm = [string]$algorithmValue
    if (-not [string]::Equals($keyId, $Configuration.KeyOcid, [StringComparison]::Ordinal) -or
        $keyVersionId -cnotmatch '^ocid1\.keyversion\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        -not [string]::Equals($algorithm, $Configuration.SigningAlgorithm, [StringComparison]::Ordinal)) {
        throw "OCI KMS signing response did not match the pinned key and algorithm."
    }
    if ($signature -cnotmatch '\A[A-Za-z0-9+/]+={0,2}\z') {
        throw "OCI KMS signing response did not contain strict base64."
    }
    try {
        $signatureBytes = [Convert]::FromBase64String($signature)
    }
    catch {
        throw "OCI KMS signing response did not contain a valid signature."
    }
    if ($signatureBytes.Length -lt 64 -or $signatureBytes.Length -gt 2048) {
        throw "OCI KMS signing response contained an invalid signature size."
    }

    return [pscustomobject][ordered]@{
        type = "oci-kms-asymmetric-signature"
        digest_algorithm = "SHA-256"
        key_id = $keyId
        key_version_id = $keyVersionId
        signing_algorithm = $algorithm
        payload_sha256 = $payloadHex
        signature = $signature
    }
}

function Get-CurrentPublicIpv4 {
    $curlPath = Resolve-ApplicationPath -Names @("curl.exe", "curl")
    $address = Invoke-NativeCommand `
        -FilePath $curlPath `
        -Arguments @("--silent", "--show-error", "--fail", "--max-time", "15", "https://api.ipify.org") `
        -CaptureOutput
    $parsedAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($address, [ref]$parsedAddress) -or
        $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw "Could not determine a valid public IPv4 address for the Packer SSH preflight."
    }

    return $parsedAddress.ToString()
}

function Confirm-TesterSourceCidr {
    param([string]$SourceCidr)

    if ($SourceCidr -notmatch '^([^/]+)/32$') {
        throw "tester_source_cidr must be one IPv4 /32 address for Packer and Terraform access."
    }

    $configuredAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($Matches[1], [ref]$configuredAddress) -or
        $configuredAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw "tester_source_cidr is not a valid IPv4 /32 address: $SourceCidr"
    }

    $currentAddress = Get-CurrentPublicIpv4
    if ($configuredAddress.ToString() -ne $currentAddress) {
        throw "Current public IP is $currentAddress, but tester_source_cidr is $SourceCidr. Update 01-edit/terraform.tfvars to tester_source_cidr = `"$currentAddress/32`" and rerun. No OCI resources were created."
    }

    Write-Pass "Current public IP matches tester_source_cidr ($SourceCidr)"
}

function Confirm-PersistentPackerNsg {
    param(
        [string]$OciPath,
        [string[]]$CommonArguments,
        [string]$PackerVariableFile,
        [string]$CompartmentOcid,
        [string]$SubnetOcid,
        [string]$SourceCidr
    )

    $nsgOcids = @(Get-HclStringListValue -Path $PackerVariableFile -Name "nsg_ocids")
    if ($nsgOcids.Count -ne 1) {
        throw "Packer nsg_ocids must contain exactly one persistent SSH-only NSG OCID."
    }
    $nsgOcid = [string]$nsgOcids[0]
    if ($nsgOcid -notmatch '^ocid1\.networksecuritygroup\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Packer nsg_ocids contains an invalid Network Security Group OCID."
    }

    $subnetJson = Invoke-NativeCommand `
        -FilePath $OciPath `
        -Arguments (@("network", "subnet", "get", "--subnet-id", $SubnetOcid, "--output", "json") + $CommonArguments) `
        -CaptureOutput
    try {
        $subnet = $subnetJson | ConvertFrom-Json
        $vcnOcid = [string]$subnet.data.'vcn-id'
    }
    catch {
        throw "OCI CLI did not return valid subnet data for the Packer NSG preflight."
    }
    if ($vcnOcid -notmatch '^ocid1\.vcn\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "OCI subnet data did not contain a valid VCN OCID."
    }

    $nsgJson = Invoke-NativeCommand `
        -FilePath $OciPath `
        -Arguments (@("network", "nsg", "get", "--nsg-id", $nsgOcid, "--output", "json") + $CommonArguments) `
        -CaptureOutput
    try {
        $nsg = $nsgJson | ConvertFrom-Json
        $nsgData = $nsg.data
    }
    catch {
        throw "OCI CLI did not return valid NSG data for the Packer NSG preflight."
    }
    if ([string]$nsgData.'lifecycle-state' -ne "AVAILABLE") {
        throw "Persistent Packer NSG '$nsgOcid' is not AVAILABLE."
    }
    if ([string]$nsgData.'vcn-id' -ne $vcnOcid) {
        throw "Persistent Packer NSG '$nsgOcid' is not in the build subnet's VCN."
    }
    if ([string]$nsgData.'compartment-id' -ne $CompartmentOcid) {
        throw "Persistent Packer NSG '$nsgOcid' is not in the configured Packer compartment."
    }

    $rulesJson = Invoke-NativeCommand `
        -FilePath $OciPath `
        -Arguments (@("network", "nsg", "rules", "list", "--nsg-id", $nsgOcid, "--all", "--output", "json") + $CommonArguments) `
        -CaptureOutput
    try {
        $rules = @((($rulesJson | ConvertFrom-Json).data))
    }
    catch {
        throw "OCI CLI did not return valid rule data for the Packer NSG preflight."
    }

    $ruleMatches = @($rules | Where-Object {
        $tcpOptions = $_.'tcp-options'
        $portRange = if ($null -ne $tcpOptions) { $tcpOptions.'destination-port-range' } else { $null }
        $_.direction -eq "INGRESS" -and
        $_.protocol -eq "6" -and
        $_.source -eq $SourceCidr -and
        $_.'source-type' -eq "CIDR_BLOCK" -and
        $_.'is-stateless' -eq $false -and
        $_.'is-valid' -eq $true -and
        $null -ne $portRange -and
        [int]$portRange.min -eq 22 -and
        [int]$portRange.max -eq 22
    })
    if ($rules.Count -ne 1 -or $ruleMatches.Count -ne 1) {
        throw "Persistent Packer NSG '$nsgOcid' must contain only one valid ingress rule: TCP 22 from $SourceCidr. Update the NSG rule and rerun; this pipeline does not change NSGs."
    }

    Write-Pass "Persistent Packer NSG '$($nsgData.'display-name')' allows only TCP 22 from $SourceCidr"
}

function Get-PackerArtifactId {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Packer completed without creating its manifest: $Path"
    }

    try {
        $manifest = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        throw "Packer manifest is not valid JSON: $Path"
    }

    $builds = @($manifest.builds)
    if ($builds.Count -eq 0) {
        throw "Packer manifest does not contain a completed build."
    }

    $currentBuilds = @($builds | Where-Object {
        -not [string]::IsNullOrWhiteSpace([string]$manifest.last_run_uuid) -and
        [string]$_.packer_run_uuid -eq [string]$manifest.last_run_uuid
    })
    if ($currentBuilds.Count -eq 0) {
        $currentBuilds = @($builds[-1])
    }

    $artifactId = [string]$currentBuilds[-1].artifact_id
    $imageOcidMatch = [regex]::Match($artifactId, 'ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+')
    if (-not $imageOcidMatch.Success) {
        throw "Packer manifest did not contain a valid OCI image OCID."
    }

    return $imageOcidMatch.Value
}

function New-ManualBuildInstanceName {
    param([string]$Name)

    $suffix = "-manual-{0}-{1}" -f (
        (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
    ), $PID
    $maximumPrefixLength = 255 - $suffix.Length
    if ($maximumPrefixLength -lt 1) {
        throw "Could not create a valid manual build instance name."
    }
    $prefixLength = [Math]::Min($Name.Length, $maximumPrefixLength)
    return $Name.Substring(0, $prefixLength) + $suffix
}

function Get-ImageSourceDigest {
    param([string]$Root)

    $deployRoot = [System.IO.Path]::GetFullPath((Join-Path $Root "..\.."))
    $liveStackRoot = Join-Path $deployRoot "ll-lakehouse"
    # Hash only files provisioned into the image, not local Packer launch configuration.
    $sourceEntries = @(
        [pscustomobject]@{ Path = (Join-Path $liveStackRoot "ingestion"); Label = "ll-lakehouse/ingestion" },
        [pscustomobject]@{ Path = (Join-Path $liveStackRoot "init"); Label = "ll-lakehouse/init" },
        [pscustomobject]@{ Path = (Join-Path $liveStackRoot "prepare-custom-image.sh"); Label = "ll-lakehouse/prepare-custom-image.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "01-edit\public-endpoints.json"); Label = "01-edit/public-endpoints.json" },
        [pscustomobject]@{ Path = (Join-Path $Root "01-edit\service-catalog.json"); Label = "01-edit/service-catalog.json" },
        [pscustomobject]@{ Path = (Join-Path $Root "02-edit-if-needed\hooks"); Label = "02-edit-if-needed/hooks" },
        [pscustomobject]@{ Path = (Join-Path $Root "02-edit-if-needed\service-tests"); Label = "02-edit-if-needed/service-tests" },
        [pscustomobject]@{ Path = (Join-Path $Root "02-edit-if-needed\local-runtime.env.example"); Label = "02-edit-if-needed/local-runtime.env.example" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\configure-instance.sh"); Label = "03-automation/configure-instance.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\dashboard"); Label = "03-automation/dashboard" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\install-image.sh"); Label = "03-automation/install-image.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\manual-capture-access.sh"); Label = "03-automation/manual-capture-access.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\manual-capture-ready.sh"); Label = "03-automation/manual-capture-ready.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\prepare-image.sh"); Label = "03-automation/prepare-image.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\run-tests.sh"); Label = "03-automation/run-tests.sh" },
        [pscustomobject]@{ Path = (Join-Path $Root "03-automation\systemd"); Label = "03-automation/systemd" }
    )
    $files = New-Object System.Collections.Generic.List[object]
    foreach ($entry in $sourceEntries) {
        $sourcePath = $entry.Path
        if (Test-Path -LiteralPath $sourcePath -PathType Container) {
            Assert-NotReparsePoint -Path $sourcePath -Label "Image source directory"
            foreach ($file in Get-ChildItem -LiteralPath $sourcePath -Recurse -File -Force) {
                Assert-NotReparsePoint -Path $file.FullName -Label "Image source file"
                $relativePath = $file.FullName.Substring($sourcePath.Length).TrimStart("\").Replace("\", "/")
                $files.Add([pscustomobject]@{ File = $file; Label = "$($entry.Label)/$relativePath" })
            }
        }
        elseif (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
            Assert-NotReparsePoint -Path $sourcePath -Label "Image source file"
            $files.Add([pscustomobject]@{ File = (Get-Item -LiteralPath $sourcePath); Label = $entry.Label })
        }
        else {
            throw "Required image source path does not exist: $sourcePath"
        }
    }

    $digestLines = New-Object System.Collections.Generic.List[string]
    foreach ($entry in @($files | Sort-Object Label)) {
        $fileHash = (Get-FileHash -LiteralPath $entry.File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $digestLines.Add(("{0}={1}" -f $entry.Label, $fileHash))
    }
    $payload = [System.Text.Encoding]::UTF8.GetBytes((($digestLines -join "`n") + "`n"))
    return ConvertTo-LowerHex -Bytes (Get-Sha256Digest -Bytes $payload)
}

function Invoke-PackerManualCaptureBuild {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$InstanceName
    )

    Write-Step (Format-Command -FilePath $FilePath -Arguments $Arguments)
    $capturedLines = New-Object System.Collections.Generic.List[string]
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $exitCode = -1

    try {
        & $FilePath @Arguments 2>&1 | ForEach-Object {
            $line = $_.ToString()
            [void]$capturedLines.Add($line)
            Write-Host $line
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    $expectedMarker = "OCI_MANUAL_CAPTURE_READY:$InstanceName"
    $markerFound = $false
    foreach ($line in $capturedLines) {
        if ($line.IndexOf($expectedMarker, [StringComparison]::Ordinal) -ge 0) {
            $markerFound = $true
            break
        }
    }

    if ($exitCode -eq 0 -or -not $markerFound) {
        throw "Packer did not reach the final manual-capture marker. Because -on-error=abort preserves resources, inspect and terminate the exact build instance '$InstanceName' before retrying."
    }

    Write-Pass "Packer completed provisioning and deliberately preserved '$InstanceName' before image capture"
}

function Invoke-OciJsonQuery {
    param(
        [string]$OciPath,
        [string[]]$Arguments,
        [string[]]$CommonArguments,
        [string]$OperationLabel,
        [switch]$AllowEmptyData
    )

    $responseText = Invoke-NativeCommandSeparatedOutput `
        -FilePath $OciPath `
        -Arguments ($Arguments + $CommonArguments + @("--output", "json")) `
        -OperationLabel $OperationLabel
    if ([string]::IsNullOrWhiteSpace($responseText)) {
        if ($AllowEmptyData) {
            return [pscustomobject]@{ data = @() }
        }
        throw "$OperationLabel returned no JSON data."
    }
    try {
        return ($responseText | ConvertFrom-Json)
    }
    catch {
        throw "$OperationLabel did not return valid JSON."
    }
}

function Get-OciInstanceByDisplayName {
    param(
        [string]$OciPath,
        [string[]]$CommonArguments,
        [string]$CompartmentOcid,
        [string]$InstanceName
    )

    $response = Invoke-OciJsonQuery `
        -OciPath $OciPath `
        -Arguments @(
            "compute", "instance", "list",
            "--compartment-id", $CompartmentOcid,
            "--display-name", $InstanceName,
            "--all"
        ) `
        -CommonArguments $CommonArguments `
        -OperationLabel "OCI manual build instance lookup"
    $instances = @($response.data)
    if ($instances.Count -ne 1) {
        throw "Expected exactly one OCI Compute instance named '$InstanceName' in the configured compartment, but found $($instances.Count)."
    }

    $instance = $instances[0]
    if ([string]$instance.id -cnotmatch '^ocid1\.instance\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        -not [string]::Equals(
            [string]$instance.'display-name',
            $InstanceName,
            [StringComparison]::Ordinal
        )) {
        throw "OCI returned invalid data for manual build instance '$InstanceName'."
    }
    return $instance
}

function Get-OciInstancePublicIp {
    param(
        [string]$OciPath,
        [string[]]$CommonArguments,
        [string]$InstanceOcid
    )

    $response = Invoke-OciJsonQuery `
        -OciPath $OciPath `
        -Arguments @(
            "compute", "instance", "list-vnics",
            "--instance-id", $InstanceOcid,
            "--all"
        ) `
        -CommonArguments $CommonArguments `
        -OperationLabel "OCI manual build VNIC lookup"
    $vnics = @($response.data)
    if ($vnics.Count -eq 0) {
        return ""
    }
    $primaryVnic = @($vnics | Where-Object { $_.'is-primary' -eq $true } | Select-Object -First 1)
    if ($primaryVnic.Count -eq 0) {
        $primaryVnic = @($vnics[0])
    }
    return [string]$primaryVnic[0].'public-ip'
}

function Write-ManualCaptureReceipt {
    param(
        [string]$Path,
        [string]$Name,
        [object]$Instance,
        [string]$PublicIp,
        [string]$CompartmentOcid,
        [string]$ImageCompartmentOcid,
        [string]$BaseImageOcid,
        [string]$Region,
        [string]$SourceSha256
    )

    $directory = Split-Path -Parent $Path
    Assert-NotReparsePoint -Path $directory -Label "Manual capture automation directory" -AllowMissing
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Assert-NotReparsePoint -Path $directory -Label "Manual capture automation directory"
    Assert-NotReparsePoint -Path $Path -Label "Manual capture receipt" -AllowMissing

    $receipt = [pscustomobject][ordered]@{
        schema_version = 1
        kind = "oci-manual-image-capture"
        image_name = $Name
        build_instance_name = [string]$Instance.'display-name'
        build_instance_ocid = [string]$Instance.id
        build_instance_public_ip = $PublicIp
        compartment_ocid = $CompartmentOcid
        image_compartment_ocid = $ImageCompartmentOcid
        base_image_ocid = $BaseImageOcid
        source_sha256 = $SourceSha256
        region = $Region
        created_utc = Get-UtcTimestamp
    }
    $json = ($receipt | ConvertTo-Json -Depth 3) + [Environment]::NewLine
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8WithoutBom)
    Assert-NotReparsePoint -Path $Path -Label "Manual capture receipt"
}

function Read-ManualCaptureReceipt {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Manual capture receipt was not found: $Path. Run -PrepareManualCapture from this project first."
    }
    Assert-NotReparsePoint -Path $Path -Label "Manual capture receipt"
    try {
        $receipt = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        throw "Manual capture receipt is not valid JSON: $Path"
    }

    $expectedProperties = @(
        "base_image_ocid",
        "build_instance_name",
        "build_instance_ocid",
        "build_instance_public_ip",
        "compartment_ocid",
        "created_utc",
        "image_compartment_ocid",
        "image_name",
        "kind",
        "region",
        "schema_version",
        "source_sha256"
    ) | Sort-Object
    $actualProperties = @($receipt.PSObject.Properties.Name | Sort-Object)
    if (@(Compare-Object -ReferenceObject $expectedProperties -DifferenceObject $actualProperties).Count -ne 0 -or
        -not (Test-ExactIntegerValue -Value $receipt.schema_version -Expected 1) -or
        -not (Test-OrdinalStringEquals -Value $receipt.kind -Expected "oci-manual-image-capture") -or
        [string]$receipt.image_name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$' -or
        [string]$receipt.build_instance_name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$' -or
        [string]$receipt.build_instance_ocid -cnotmatch '^ocid1\.instance\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        [string]$receipt.compartment_ocid -cnotmatch '^ocid1\.compartment\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        [string]$receipt.image_compartment_ocid -cnotmatch '^ocid1\.compartment\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        [string]$receipt.base_image_ocid -cnotmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
        [string]$receipt.source_sha256 -cnotmatch '^[a-f0-9]{64}$' -or
        [string]$receipt.region -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)+-[0-9]+$' -or
        -not (Test-UtcTimestamp -Value ([string]$receipt.created_utc))) {
        throw "Manual capture receipt contains invalid or unsupported values: $Path"
    }
    return $receipt
}

function Assert-ManualCapturedImage {
    param(
        [string]$OciPath,
        [string[]]$CommonArguments,
        [object]$Receipt,
        [string]$ImageOcid,
        [string]$ImageName
    )

    if (-not [string]::Equals(
            [string]$Receipt.image_name,
            $ImageName,
            [StringComparison]::Ordinal
        )) {
        throw "ImageName '$ImageName' does not match the pending manual capture '$($Receipt.image_name)'."
    }
    $currentSourceSha256 = Get-ImageSourceDigest -Root $ProjectRoot
    if (-not [string]::Equals(
            [string]$Receipt.source_sha256,
            $currentSourceSha256,
            [StringComparison]::Ordinal
        )) {
        Write-Warning "Image source files changed after the manual build VM was prepared. Continuing because ExistingImageOcid explicitly identifies the captured image; this run validates that image, not the current local source tree."
    }

    $instanceResponse = Invoke-OciJsonQuery `
        -OciPath $OciPath `
        -Arguments @(
            "compute", "instance", "list",
            "--compartment-id", [string]$Receipt.compartment_ocid,
            "--display-name", [string]$Receipt.build_instance_name,
            "--all"
        ) `
        -CommonArguments $CommonArguments `
        -OperationLabel "OCI manual build cleanup verification" `
        -AllowEmptyData
    $namedInstances = @($instanceResponse.data)
    if ($namedInstances.Count -gt 0) {
        $recordedInstances = @(
            $namedInstances | Where-Object {
                [string]::Equals(
                    [string]$_.id,
                    [string]$Receipt.build_instance_ocid,
                    [StringComparison]::Ordinal
                )
            }
        )
        if ($recordedInstances.Count -ne 1 -or $namedInstances.Count -ne 1) {
            throw "OCI returned an unexpected instance for preserved build name '$($Receipt.build_instance_name)'. Refusing to trust the manual image handoff."
        }
        if (-not [string]::Equals(
                [string]$recordedInstances[0].'lifecycle-state',
                "TERMINATED",
                [StringComparison]::Ordinal
            )) {
            throw "The preserved build instance '$($Receipt.build_instance_name)' is not TERMINATED. After the custom image becomes AVAILABLE, terminate that instance and its boot volume before continuing."
        }
    }

    $imageResponse = Invoke-OciJsonQuery `
        -OciPath $OciPath `
        -Arguments @("compute", "image", "get", "--image-id", $ImageOcid) `
        -CommonArguments $CommonArguments `
        -OperationLabel "OCI manually captured image verification"
    $image = $imageResponse.data
    if (-not [string]::Equals([string]$image.id, $ImageOcid, [StringComparison]::Ordinal) -or
        -not [string]::Equals([string]$image.'display-name', $ImageName, [StringComparison]::Ordinal) -or
        -not [string]::Equals(
            [string]$image.'compartment-id',
            [string]$Receipt.image_compartment_ocid,
            [StringComparison]::Ordinal
        ) -or
        -not [string]::Equals(
            [string]$image.'lifecycle-state',
            "AVAILABLE",
            [StringComparison]::Ordinal
        )) {
        throw "The supplied image must be AVAILABLE, named '$ImageName', and stored in the configured image compartment."
    }

    $imageCreated = [DateTimeOffset]::MinValue
    $receiptCreated = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse(
            [string]$image.'time-created',
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::RoundtripKind,
            [ref]$imageCreated
        ) -or
        -not [DateTimeOffset]::TryParse(
            [string]$Receipt.created_utc,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::RoundtripKind,
            [ref]$receiptCreated
        ) -or
        $imageCreated -lt $receiptCreated) {
        throw "The supplied image was not created after this manual build was prepared."
    }

    Write-Pass "Verified manually captured image '$ImageName' ($ImageOcid) and terminated build VM"
}

function Assert-ExistingCapturedImage {
    param(
        [string]$OciPath,
        [string[]]$CommonArguments,
        [string]$ImageOcid,
        [string]$ImageName,
        [string]$ImageCompartmentOcid
    )

    $imageResponse = Invoke-OciJsonQuery `
        -OciPath $OciPath `
        -Arguments @("compute", "image", "get", "--image-id", $ImageOcid) `
        -CommonArguments $CommonArguments `
        -OperationLabel "OCI existing image verification"
    $image = $imageResponse.data
    if (-not [string]::Equals([string]$image.id, $ImageOcid, [StringComparison]::Ordinal) -or
        -not [string]::Equals([string]$image.'display-name', $ImageName, [StringComparison]::Ordinal) -or
        -not [string]::Equals(
            [string]$image.'compartment-id',
            $ImageCompartmentOcid,
            [StringComparison]::Ordinal
        ) -or
        -not [string]::Equals(
            [string]$image.'lifecycle-state',
            "AVAILABLE",
            [StringComparison]::Ordinal
        )) {
        throw "The supplied image must be AVAILABLE, named '$ImageName', and stored in the configured image compartment."
    }

    Write-Pass "Verified existing image '$ImageName' ($ImageOcid)"
}

function Resolve-ProjectTerraformDirectory {
    param([string]$RequestedDirectory)

    if (-not [string]::IsNullOrWhiteSpace($RequestedDirectory)) {
        return Resolve-ExistingDirectory `
            -Path $RequestedDirectory `
            -Label "Terraform test directory"
    }

    $embeddedTerraformDirectory = Join-Path (Split-Path -Parent $ProjectRoot) "terraform"
    if (Test-Path -LiteralPath $embeddedTerraformDirectory -PathType Container) {
        Write-Step "Using embedded Terraform folder 'auto_build/terraform'"
        return Resolve-ExistingDirectory `
            -Path $embeddedTerraformDirectory `
            -Label "Terraform test directory"
    }

    $gitPath = Resolve-CommandPath -Name "git"
    $demoRepositoryRoot = Invoke-NativeCommand `
        -FilePath $gitPath `
        -Arguments @("-C", $ProjectRoot, "rev-parse", "--show-toplevel") `
        -CaptureOutput
    $workspaceRoot = Split-Path -Parent $demoRepositoryRoot
    $terraformRepository = Join-Path $workspaceRoot "terraform"
    $projectName = Split-Path -Leaf $ProjectRoot
    $bundleName = Split-Path -Leaf (Split-Path -Parent $ProjectRoot)
    $bundleTerraformDirectory = Join-Path $terraformRepository $bundleName
    $pairedTerraformDirectory = Join-Path $terraformRepository $projectName
    $starterTerraformDirectory = Join-Path (Join-Path $terraformRepository "pilot-test-template") "custom-image"

    if ($projectName -eq "01-image-build" -and
        (Test-Path -LiteralPath $bundleTerraformDirectory -PathType Container)) {
        Write-Step "Using Terraform folder '$bundleName' paired with the two-stage demo-code bundle"
        return Resolve-ExistingDirectory `
            -Path $bundleTerraformDirectory `
            -Label "Terraform test directory"
    }
    if (Test-Path -LiteralPath $pairedTerraformDirectory -PathType Container) {
        Write-Step "Using paired Terraform folder '$projectName'"
        return Resolve-ExistingDirectory `
            -Path $pairedTerraformDirectory `
            -Label "Terraform test directory"
    }
    if ($projectName -eq "custom-image-build-template" -and
        (Test-Path -LiteralPath $starterTerraformDirectory -PathType Container)) {
        Write-Step "Using Terraform starter folder 'pilot-test-template/custom-image' for the untouched custom-image template"
        return Resolve-ExistingDirectory `
            -Path $starterTerraformDirectory `
            -Label "Terraform test directory"
    }

    throw "No paired Terraform folder was found. Expected $bundleTerraformDirectory for a two-stage bundle or $pairedTerraformDirectory for a standalone image project. Copy the tracked custom-image Terraform starter to the matching path, or pass -TerraformDirectory explicitly for a nonstandard layout."
}

function Assert-InspectionCleanupCompletedForRecovery {
    param(
        [object]$Receipt,
        [string]$ResolvedTerraformDirectory
    )

    $inspectionId = [string]$Receipt.inspection_id
    if ($inspectionId -cnotmatch '^inspection-[0-9]{14}-[0-9]+$') {
        throw "The deployed receipt does not contain a valid inspection ID for recovery."
    }
    $terraformAutomationDirectory = Join-Path $ResolvedTerraformDirectory ".automation"
    $inspectionReceiptPath = Join-Path $terraformAutomationDirectory "$inspectionId.json"
    Assert-NotReparsePoint `
        -Path $inspectionReceiptPath `
        -Label "Disposable inspection receipt" `
        -AllowMissing
    if (Test-Path -LiteralPath $inspectionReceiptPath) {
        throw "Inspection '$inspectionId' still has a disposable receipt, so cleanup is not proven. Run the printed -CleanupInspection command first."
    }

    $terraformPath = Resolve-CommandPath -Name "terraform"
    Push-Location $ResolvedTerraformDirectory
    try {
        $workspaceOutput = Invoke-NativeCommandSeparatedOutput `
            -FilePath $terraformPath `
            -Arguments @("workspace", "list") `
            -OperationLabel "Terraform workspace recovery check"
    }
    finally {
        Pop-Location
    }

    $workspaceNames = @(
        $workspaceOutput -split "\r?\n" |
            ForEach-Object { $_.Trim().TrimStart("*").Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if ($workspaceNames.Count -eq 0) {
        throw "Terraform returned no workspaces, so completed inspection cleanup could not be verified."
    }
    if (@($workspaceNames | Where-Object {
                [string]::Equals($_, $inspectionId, [StringComparison]::Ordinal)
            }).Count -ne 0) {
        throw "Terraform workspace '$inspectionId' still exists, so cleanup is not complete. Restore the inspection receipt if needed and rerun cleanup before approval."
    }

    Write-Pass "Verified that inspection '$inspectionId' receipt and Terraform workspace were removed"
}

$readyReceiptLockAcquired = $false
if (-not $ValidateOnly) {
    Enter-ReadyReceiptLock
    $readyReceiptLockAcquired = $true
}

try {
if ($ApproveForMarketplace -and [string]::IsNullOrWhiteSpace($CleanupInspection)) {
    $currentReceipt = Read-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Required
    if (Test-OrdinalStringEquals -Value $currentReceipt.inspection_status -Expected "approved") {
        Write-Pass "Release '$($currentReceipt.release_id)' is already signed and approved for Marketplace handoff"
        return
    }
    if (Test-OrdinalStringEquals -Value $currentReceipt.inspection_status -Expected "deployed") {
        $recoveryTerraformDirectory = Resolve-ProjectTerraformDirectory `
            -RequestedDirectory $TerraformDirectory
        Assert-InspectionCleanupCompletedForRecovery `
            -Receipt $currentReceipt `
            -ResolvedTerraformDirectory $recoveryTerraformDirectory

        $cleanupUtc = Get-UtcTimestamp
        $currentReceipt.inspection_completed_utc = $cleanupUtc
        $currentReceipt.updated_utc = $cleanupUtc
        $currentReceipt.inspection_status = "cleaned_not_approved"
        $currentReceipt.inspection_approved_utc = ""
        $currentReceipt.attestation = $null
        Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $currentReceipt
        Write-Pass "Recovered the cleaned inspection receipt; Marketplace approval remains pending"
    }
    if (-not (Test-OrdinalStringEquals `
            -Value $currentReceipt.inspection_status `
            -Expected "cleaned_not_approved")) {
        throw "Standalone Marketplace approval requires a cleaned_not_approved receipt or a deployed receipt whose completed cleanup can be proven."
    }

    if ([string]::IsNullOrWhiteSpace($MarketplaceAttestationFile)) {
        $MarketplaceAttestationFile = $DefaultMarketplaceAttestationPath
    }
    $attestationConfiguration = Read-MarketplaceAttestationConfiguration -Path $MarketplaceAttestationFile
    $approvalUtc = Get-UtcTimestamp
    $currentReceipt.inspection_status = "approved"
    $currentReceipt.inspection_approved_utc = $approvalUtc
    $currentReceipt.updated_utc = $approvalUtc
    $currentReceipt.attestation = New-KmsReceiptAttestation `
        -Receipt $currentReceipt `
        -Configuration $attestationConfiguration
    Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $currentReceipt
    Write-Pass "Release '$($currentReceipt.release_id)' was signed and approved for Marketplace handoff"
    return
}

$TerraformDirectory = Resolve-ProjectTerraformDirectory -RequestedDirectory $TerraformDirectory
$terraformTestScript = Resolve-ExistingFile `
    -Path (Join-Path (Join-Path $TerraformDirectory "03-automation") "test-custom-image.ps1") `
    -Label "Terraform test script"

if (-not [string]::IsNullOrWhiteSpace($ShowInspectionInfo)) {
    & $terraformTestScript -ShowInspectionInfo $ShowInspectionInfo
    return
}

if (-not [string]::IsNullOrWhiteSpace($CleanupInspection)) {
    $attestationConfiguration = $null
    if ($ApproveForMarketplace) {
        if ([string]::IsNullOrWhiteSpace($MarketplaceAttestationFile)) {
            $MarketplaceAttestationFile = $DefaultMarketplaceAttestationPath
        }
    }

    $inspectionReceipt = Join-Path (Join-Path $TerraformDirectory ".automation") "$CleanupInspection.json"
    if (-not (Test-Path -LiteralPath $inspectionReceipt -PathType Leaf)) {
        throw "Inspection receipt was not found: $inspectionReceipt"
    }

    $correlatedReadyReceipt = $null
    $correlationError = ""
    $disposableImageOcid = ""
    $disposableContext = $null
    try {
        $disposableContext = Get-DisposableInspectionContext `
            -Path $inspectionReceipt `
            -InspectionId $CleanupInspection
        $disposableImageOcid = [string]$disposableContext.ImageOcid

        if (Test-Path -LiteralPath $ReadyReceiptPath -PathType Leaf) {
            $candidateReceipt = Read-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Required
            if (-not [string]::Equals(
                    [string]$candidateReceipt.image_ocid,
                    $disposableImageOcid,
                    [StringComparison]::Ordinal
                )) {
                throw "The sanitized receipt image OCID does not match the disposable inspection receipt."
            }
            if (-not (Test-OrdinalStringEquals `
                    -Value $candidateReceipt.inspection_id `
                    -Expected $CleanupInspection) -or
                -not (Test-OrdinalStringEquals `
                    -Value $candidateReceipt.inspection_status `
                    -Expected "deployed")) {
                throw "The sanitized receipt is not correlated with deployed inspection '$CleanupInspection'."
            }
            $correlatedReadyReceipt = $candidateReceipt
        }
        elseif ($ApproveForMarketplace) {
            throw "The sanitized Ready-for-Marketplace receipt does not exist."
        }
    }
    catch {
        $correlationError = $_.Exception.Message
    }

    if ($null -ne $disposableContext) {
        $cleanupSessionTargets = @()
        $cleanupVariableFile = [string]$disposableContext.VariableSnapshotPath
        $cleanupAuthMethod = Get-AssignmentValue -Path $cleanupVariableFile -Name "ociAuthMethod"
        if ($cleanupAuthMethod -eq "SecurityToken") {
            $cleanupProfile = Get-AssignmentValue -Path $cleanupVariableFile -Name "ociConfigProfile"
            $cleanupRegion = Get-AssignmentValue -Path $cleanupVariableFile -Name "ociRegionIdentifier"
            if ([string]::IsNullOrWhiteSpace($cleanupProfile) -or [string]::IsNullOrWhiteSpace($cleanupRegion)) {
                throw "The inspection variable snapshot must define ociConfigProfile and ociRegionIdentifier for SecurityToken authentication."
            }
            $cleanupOciConfig = Resolve-ExistingFile `
                -Path (Join-Path (Join-Path $HOME ".oci") "config") `
                -Label "OCI configuration file"
            $cleanupSessionTargets = @(Add-SecurityTokenTarget `
                -Targets $cleanupSessionTargets `
                -ConfigFile $cleanupOciConfig `
                -Profile $cleanupProfile `
                -Region $cleanupRegion)
        }
        Refresh-SecurityTokenTargets -Targets $cleanupSessionTargets
    }

    & $terraformTestScript -CleanupInspection $CleanupInspection

    if ($null -ne $correlatedReadyReceipt) {
        try {
            $currentReceipt = Read-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Required
            if (-not [string]::Equals(
                    [string]$currentReceipt.release_id,
                    [string]$correlatedReadyReceipt.release_id,
                    [StringComparison]::Ordinal
                ) -or
                -not [string]::Equals(
                    [string]$currentReceipt.image_ocid,
                    $disposableImageOcid,
                    [StringComparison]::Ordinal
                ) -or
                -not (Test-OrdinalStringEquals `
                    -Value $currentReceipt.inspection_id `
                    -Expected $CleanupInspection) -or
                -not (Test-OrdinalStringEquals `
                    -Value $currentReceipt.inspection_status `
                    -Expected "deployed")) {
                throw "The sanitized receipt changed or no longer matches the cleaned inspection."
            }

            $cleanupUtc = Get-UtcTimestamp
            $currentReceipt.inspection_completed_utc = $cleanupUtc
            $currentReceipt.updated_utc = $cleanupUtc
            $currentReceipt.inspection_status = "cleaned_not_approved"
            $currentReceipt.inspection_approved_utc = ""
            $currentReceipt.attestation = $null
            Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $currentReceipt

            if ($ApproveForMarketplace) {
                $attestationConfiguration = Read-MarketplaceAttestationConfiguration `
                    -Path $MarketplaceAttestationFile
                $approvalUtc = Get-UtcTimestamp
                $currentReceipt.inspection_status = "approved"
                $currentReceipt.inspection_approved_utc = $approvalUtc
                $currentReceipt.updated_utc = $approvalUtc
                $currentReceipt.attestation = New-KmsReceiptAttestation `
                    -Receipt $currentReceipt `
                    -Configuration $attestationConfiguration
                Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $currentReceipt
            }

            if ($ApproveForMarketplace) {
                Write-Pass "Inspection cleanup completed and release '$($currentReceipt.release_id)' was signed and approved for Marketplace handoff"
            }
            else {
                Write-Step "Inspection cleanup completed without Marketplace approval"
            }
        }
        catch {
            throw "Inspection cleanup succeeded, but the Ready-for-Marketplace receipt could not be finalized. This command is returning failure. Fix the local receipt path or KMS configuration, then rerun with -ApproveForMarketplace only; standalone approval will reconcile a verified completed cleanup if necessary. $($_.Exception.Message)"
        }
    }
    elseif ($ApproveForMarketplace) {
        if ([string]::IsNullOrWhiteSpace($correlationError)) {
            $correlationError = "No matching sanitized receipt was available."
        }
        throw "Inspection cleanup succeeded, but Marketplace approval was not recorded: $correlationError"
    }
    elseif (-not [string]::IsNullOrWhiteSpace($correlationError) -and
        (Test-Path -LiteralPath $ReadyReceiptPath -PathType Leaf)) {
        throw "Inspection cleanup succeeded, but the Ready-for-Marketplace receipt could not be correlated or transitioned. This command is returning failure. Rerun with -ApproveForMarketplace only after resolving the receipt error; standalone approval will verify that cleanup completed. $correlationError"
    }
    return
}

if ([string]::IsNullOrWhiteSpace($TerraformVariableFile)) {
    $TerraformVariableFile = Join-Path (Join-Path $TerraformDirectory "01-edit") "terraform.tfvars"
}
$TerraformVariableFile = Resolve-ExistingFile -Path $TerraformVariableFile -Label "Terraform variable file"
$publicEndpointsFile = Resolve-ExistingFile `
    -Path (Join-Path (Join-Path $ProjectRoot "01-edit") "public-endpoints.json") `
    -Label "Public endpoints file"
$platformEndpointsFile = Resolve-ExistingFile `
    -Path (Join-Path (Join-Path (Join-Path $ProjectRoot "03-automation") "dashboard") "public-endpoints.json") `
    -Label "Platform endpoints file"
$serviceCatalogFile = Resolve-ExistingFile `
    -Path (Join-Path (Join-Path $ProjectRoot "01-edit") "service-catalog.json") `
    -Label "Service catalog file"

if (Get-Content -LiteralPath $TerraformVariableFile | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '<[^>]+>' }) {
    throw "Terraform variable file still contains placeholder values: $TerraformVariableFile"
}

$sessionTargets = @()
$terraformAuthMethod = Get-AssignmentValue -Path $TerraformVariableFile -Name "ociAuthMethod"
if ($terraformAuthMethod -eq "SecurityToken") {
    $terraformProfile = Get-AssignmentValue -Path $TerraformVariableFile -Name "ociConfigProfile"
    $terraformRegion = Get-AssignmentValue -Path $TerraformVariableFile -Name "ociRegionIdentifier"
    if ([string]::IsNullOrWhiteSpace($terraformProfile) -or [string]::IsNullOrWhiteSpace($terraformRegion)) {
        throw "Terraform variables must define ociConfigProfile and ociRegionIdentifier for SecurityToken authentication."
    }
    $defaultOciConfig = Join-Path (Join-Path $HOME ".oci") "config"
    $defaultOciConfig = Resolve-ExistingFile -Path $defaultOciConfig -Label "OCI configuration file"
    $sessionTargets = @(Add-SecurityTokenTarget `
        -Targets $sessionTargets `
        -ConfigFile $defaultOciConfig `
        -Profile $terraformProfile `
        -Region $terraformRegion)
}

if (-not [string]::IsNullOrWhiteSpace($CleanupFailedTest)) {
    Refresh-SecurityTokenTargets -Targets $sessionTargets
    & $terraformTestScript `
        -CleanupFailedTest $CleanupFailedTest `
        -VariableFile $TerraformVariableFile `
        -PublicEndpointsFile $publicEndpointsFile `
        -PlatformEndpointsFile $platformEndpointsFile
    Write-Pass "Failed Terraform test '$CleanupFailedTest' was cleaned up"
    return
}

$terraformParameters = @{
    VariableFile = $TerraformVariableFile
    PublicEndpointsFile = $publicEndpointsFile
    PlatformEndpointsFile = $platformEndpointsFile
    ImageName = $ImageName
    SshPrivateKeyPath = $SshPrivateKeyPath
    WaitSeconds = $WaitSeconds
    SuppressCleanupCommand = $true
}
$testerSourceCidr = Get-AssignmentValue -Path $TerraformVariableFile -Name "tester_source_cidr"
if ([string]::IsNullOrWhiteSpace($testerSourceCidr)) {
    throw "Terraform variables must define tester_source_cidr."
}
$manualCaptureSshAccess = $null
if ($PrepareManualCapture -or -not [string]::IsNullOrWhiteSpace($ResumeManualCaptureInstance)) {
    $manualCaptureSshAccess = Resolve-ManualCaptureSshAccess `
        -TerraformVariablesPath $TerraformVariableFile `
        -RequestedPrivateKeyPath $SshPrivateKeyPath
}

if ($InspectionMode) {
    $readyReceiptForInspection = $null
    if (Test-Path -LiteralPath $ReadyReceiptPath -PathType Leaf) {
        $readyReceiptForInspection = Read-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Required
        if (-not [string]::Equals(
                [string]$readyReceiptForInspection.image_ocid,
                $ExistingImageOcid,
                [StringComparison]::Ordinal
            )) {
            throw "Inspection image OCID does not match the sanitized Ready-for-Marketplace receipt."
        }
        if (Test-OrdinalStringEquals `
                -Value $readyReceiptForInspection.inspection_status `
                -Expected "deployed") {
            throw "Inspection '$($readyReceiptForInspection.inspection_id)' is already deployed for this release. Clean it up before starting another inspection."
        }
    }
    else {
        Write-Step "No sanitized Ready-for-Marketplace receipt was found; inspection cleanup remains available, but this inspection cannot approve a handoff"
    }

    Confirm-TesterSourceCidr -SourceCidr $testerSourceCidr
    Refresh-SecurityTokenTargets -Targets $sessionTargets
    $inspectionId = "inspection-{0}-{1}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss"), $PID
    $terraformParameters["ImageOcid"] = $ExistingImageOcid
    $terraformParameters["InspectionMode"] = $true
    $terraformParameters["InspectionId"] = $inspectionId
    & $terraformTestScript @terraformParameters
    Write-Host ""

    if ($null -ne $readyReceiptForInspection) {
        try {
            $currentReceipt = Read-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Required
            if (-not [string]::Equals(
                    [string]$currentReceipt.release_id,
                    [string]$readyReceiptForInspection.release_id,
                    [StringComparison]::Ordinal
                ) -or
                -not [string]::Equals(
                    [string]$currentReceipt.image_ocid,
                    $ExistingImageOcid,
                    [StringComparison]::Ordinal
                )) {
                throw "The sanitized receipt changed while the inspection VM was being deployed."
            }

            $inspectionUtc = Get-UtcTimestamp
            $currentReceipt.inspection_id = $inspectionId
            $currentReceipt.inspection_status = "deployed"
            $currentReceipt.inspection_started_utc = $inspectionUtc
            $currentReceipt.inspection_completed_utc = ""
            $currentReceipt.inspection_approved_utc = ""
            $currentReceipt.updated_utc = $inspectionUtc
            Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $currentReceipt
            Write-Pass "Inspection '$inspectionId' was correlated with release '$($currentReceipt.release_id)'"
        }
        catch {
            Write-InspectionCleanupCommands -InspectionId $inspectionId
            throw "Inspection VM was deployed, but the sanitized receipt was not updated. Cleanup remains required: $($_.Exception.Message)"
        }
    }

    Write-InspectionCleanupCommands -InspectionId $inspectionId
    return
}

if ([string]::IsNullOrWhiteSpace($PackerVariableFile)) {
    $PackerVariableFile = Join-Path (Join-Path $ProjectRoot "01-edit") "packer.auto.pkrvars.hcl"
}
$PackerVariableFile = Resolve-ExistingFile -Path $PackerVariableFile -Label "Packer variable file"

$packerConfigFileValue = Get-AssignmentValue -Path $PackerVariableFile -Name "oci_config_file"
$packerProfile = Get-AssignmentValue -Path $PackerVariableFile -Name "oci_profile"
$packerRegion = Get-AssignmentValue -Path $PackerVariableFile -Name "region"
$packerCompartmentOcid = Get-AssignmentValue -Path $PackerVariableFile -Name "compartment_ocid"
$packerImageCompartmentOcid = Get-AssignmentValue -Path $PackerVariableFile -Name "image_compartment_ocid"
$packerSubnetOcid = Get-AssignmentValue -Path $PackerVariableFile -Name "subnet_ocid"
$packerBaseImageOcid = Get-AssignmentValue -Path $PackerVariableFile -Name "base_image_ocid"
if ([string]::IsNullOrWhiteSpace($packerImageCompartmentOcid)) {
    $packerImageCompartmentOcid = $packerCompartmentOcid
}
if ([string]::IsNullOrWhiteSpace($packerConfigFileValue) -or
    [string]::IsNullOrWhiteSpace($packerProfile) -or
    [string]::IsNullOrWhiteSpace($packerRegion) -or
    $packerCompartmentOcid -notmatch '^ocid1\.compartment\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
    $packerImageCompartmentOcid -notmatch '^ocid1\.compartment\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
    $packerSubnetOcid -notmatch '^ocid1\.subnet\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$' -or
    $packerBaseImageOcid -notmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
    throw "Packer variables must define oci_config_file, oci_profile, region, compartment_ocid, image_compartment_ocid, subnet_ocid, and base_image_ocid."
}
$packerConfigFile = Resolve-ConfigurationPath `
    -Path $packerConfigFileValue `
    -BaseDirectory (Split-Path -Parent $PackerVariableFile)
$packerConfigFile = Resolve-ExistingFile -Path $packerConfigFile -Label "OCI configuration file"
$sessionTargets = @(Add-SecurityTokenTarget `
    -Targets $sessionTargets `
    -ConfigFile $packerConfigFile `
    -Profile $packerProfile `
    -Region $packerRegion)
$ociPath = Resolve-CommandPath -Name "oci"
$ociCommonArguments = @(Get-OciCliCommonArguments `
    -ConfigFile $packerConfigFile `
    -Profile $packerProfile `
    -Region $packerRegion)

if (Get-Content -LiteralPath $PackerVariableFile | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '<[^>]+>' }) {
    throw "Packer variable file still contains placeholder values: $PackerVariableFile"
}

$stageSourceScript = Join-Path $PackerRoot "stage-lakehouse-source.ps1"
& $stageSourceScript -ProjectRoot $ProjectRoot
Confirm-FullyQualifiedContainerImages -Root $ProjectRoot
Confirm-ServiceCatalog -Root $ProjectRoot

if (-not [string]::IsNullOrWhiteSpace($ExistingImageOcid)) {
    if (Test-Path -LiteralPath $ReadyReceiptPath -PathType Leaf) {
        Remove-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath
        Write-Step "Invalidated the previous Ready-for-Marketplace receipt before testing the manually captured image"
    }

    Confirm-TesterSourceCidr -SourceCidr $testerSourceCidr
    Refresh-SecurityTokenTargets -Targets $sessionTargets
    if (Test-Path -LiteralPath $ManualCaptureReceiptPath -PathType Leaf) {
        $manualCaptureReceipt = Read-ManualCaptureReceipt -Path $ManualCaptureReceiptPath
        Assert-ManualCapturedImage `
            -OciPath $ociPath `
            -CommonArguments $ociCommonArguments `
            -Receipt $manualCaptureReceipt `
            -ImageOcid $ExistingImageOcid `
            -ImageName $ImageName
    }
    else {
        Write-Warning "Manual capture receipt was not found. Continuing because ExistingImageOcid explicitly identifies the image; OCI image identity and availability will be verified."
        Assert-ExistingCapturedImage `
            -OciPath $ociPath `
            -CommonArguments $ociCommonArguments `
            -ImageOcid $ExistingImageOcid `
            -ImageName $ImageName `
            -ImageCompartmentOcid $packerImageCompartmentOcid
    }

    $terraformParameters["ImageOcid"] = $ExistingImageOcid
    & $terraformTestScript @terraformParameters

    $readyReceipt = New-ReadyForMarketplaceReceipt `
        -Name $ImageName `
        -ImageOcid $ExistingImageOcid `
        -Region $packerRegion
    Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $readyReceipt
    if (Test-Path -LiteralPath $ManualCaptureReceiptPath -PathType Leaf) {
        Assert-NotReparsePoint -Path $ManualCaptureReceiptPath -Label "Manual capture receipt"
        Remove-Item -LiteralPath $ManualCaptureReceiptPath -Force
    }

    Write-Host ""
    Write-Host "READY FOR MARKETPLACE" -ForegroundColor Green
    Write-Host "Image name: $ImageName"
    Write-Host "Image OCID: $ExistingImageOcid"
    Write-Host "Image capture: MANUAL OCI CONSOLE FALLBACK"
    Write-Host "Terraform clean-VM deployment: PASS"
    Write-Host "All declared services and endpoints: PASS"
    Write-Host "Metadata and service-specific checks: PASS"
    Write-Host "Reboot persistence: PASS"
    Write-Host "Test resource cleanup: PASS"
    Write-Host "Inspection status: pending"
    Write-Host "Sanitized handoff receipt: $ReadyReceiptPath"
    Write-Host "Marketplace publishing has not been started."
    $PipelineStopwatch.Stop()
    Write-Host ("Total elapsed time: " + (Format-ElapsedTime -Elapsed $PipelineStopwatch.Elapsed))
    return
}

if (-not [string]::IsNullOrWhiteSpace($ResumeManualCaptureInstance)) {
    if (Test-Path -LiteralPath $ManualCaptureReceiptPath -PathType Leaf) {
        $pendingCapture = Read-ManualCaptureReceipt -Path $ManualCaptureReceiptPath
        throw "A manual image capture receipt already exists for '$($pendingCapture.build_instance_name)'. Complete that capture instead of resuming another VM."
    }

    Confirm-TesterSourceCidr -SourceCidr $testerSourceCidr
    Refresh-SecurityTokenTargets -Targets $sessionTargets
    $manualInstance = Get-OciInstanceByDisplayName `
        -OciPath $ociPath `
        -CommonArguments $ociCommonArguments `
        -CompartmentOcid $packerCompartmentOcid `
        -InstanceName $ResumeManualCaptureInstance
    if (-not [string]::Equals(
            [string]$manualInstance.'lifecycle-state',
            "RUNNING",
            [StringComparison]::Ordinal
        )) {
        throw "The preserved build instance '$ResumeManualCaptureInstance' is not RUNNING."
    }

    $manualPublicIp = Get-OciInstancePublicIp `
        -OciPath $ociPath `
        -CommonArguments $ociCommonArguments `
        -InstanceOcid ([string]$manualInstance.id)
    if ([string]::IsNullOrWhiteSpace($manualPublicIp)) {
        throw "The preserved build instance '$ResumeManualCaptureInstance' does not have a public IP for cleanup recovery."
    }

    $sshPath = Resolve-CommandPath -Name "ssh"
    $scpPath = Resolve-CommandPath -Name "scp"
    $resumeKnownHostsPath = Join-Path $AutomationDirectory "manual-capture-resume.known_hosts"
    Assert-NotReparsePoint -Path $resumeKnownHostsPath -Label "Manual-capture resume known-hosts file" -AllowMissing
    $sshOptions = @(
        "-i", $manualCaptureSshAccess.PrivateKeyPath,
        "-o", "BatchMode=yes",
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "UserKnownHostsFile=$resumeKnownHostsPath",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=3"
    )
    $cleanupWrapperPath = Resolve-ExistingFile `
        -Path (Join-Path $PackerRoot "prepare-image.sh") `
        -Label "Manual-capture cleanup wrapper"
    Invoke-NativeCommand `
        -FilePath $scpPath `
        -Arguments ($sshOptions + @(
                $cleanupWrapperPath,
                "opc@${manualPublicIp}:/tmp/oci-image-pilot-prepare-image.sh"
            ))
    Invoke-NativeCommand `
        -FilePath $sshPath `
        -Arguments ($sshOptions + @(
                "opc@${manualPublicIp}",
                "sudo install -m 0755 /tmp/oci-image-pilot-prepare-image.sh /home/opc/oci-image-pilot/scripts/prepare-image.sh && sudo /home/opc/oci-image-pilot/scripts/prepare-image.sh --final && rm -f /tmp/oci-image-pilot-prepare-image.sh"
            ))
    Write-Pass "Recovered VM passed final custom-image cleanup"

    Write-ManualCaptureReceipt `
        -Path $ManualCaptureReceiptPath `
        -Name $ImageName `
        -Instance $manualInstance `
        -PublicIp $manualPublicIp `
        -CompartmentOcid $packerCompartmentOcid `
        -ImageCompartmentOcid $packerImageCompartmentOcid `
        -BaseImageOcid $packerBaseImageOcid `
        -Region $packerRegion `
        -SourceSha256 (Get-ImageSourceDigest -Root $ProjectRoot)

    Write-Pass "Recovered the manual-capture receipt for '$ResumeManualCaptureInstance'"
    Write-Host ""
    Write-Host "MANUAL IMAGE CAPTURE VM READY" -ForegroundColor Yellow
    Write-Host "Build instance name: $ResumeManualCaptureInstance"
    Write-Host "Build instance OCID: $($manualInstance.id)"
    if (-not [string]::IsNullOrWhiteSpace($manualPublicIp)) {
        Write-Host "Build instance public IP: $manualPublicIp"
        Write-Host "Manual SSH: ssh -i `"$($manualCaptureSshAccess.PrivateKeyPath)`" opc@$manualPublicIp"
    }
    Write-Host "Target custom image name: $ImageName"
    Write-Host "Target image compartment: $packerImageCompartmentOcid"
    Write-Host ""
    Write-Host "OCI Console steps:"
    Write-Host "1. Open this exact Compute instance and stop it."
    Write-Host "2. Choose More actions > Create custom image."
    Write-Host "3. Name the image exactly '$ImageName' and use the target image compartment above."
    Write-Host "4. Wait until the custom image is AVAILABLE."
    Write-Host "5. Terminate this preserved build instance and delete its boot volume."
    return
}

$packerPath = Resolve-CommandPath -Name "packer"

Push-Location $PackerRoot
try {
    Invoke-NativeCommand -FilePath $packerPath -Arguments @("init", ".")
    Invoke-NativeCommand -FilePath $packerPath -Arguments @("fmt", "-check", ".")

    $manualBuildInstanceName = ""
    $packerVariables = @(
        "-var-file=$PackerVariableFile",
        "-var", "image_name=$ImageName"
    )
    if ($PrepareManualCapture) {
        $manualBuildInstanceName = New-ManualBuildInstanceName -Name $ImageName
        $packerVariables += @(
            "-var", "skip_create_image=true",
            "-var", "manual_capture_mode=true",
            "-var", "build_instance_name=$manualBuildInstanceName",
            "-var", "manual_capture_ssh_public_key=$($manualCaptureSshAccess.PublicKey)"
        )
    }
    else {
        $packerVariables += @(
            "-var", "skip_create_image=false",
            "-var", "manual_capture_mode=false"
        )
    }
    Invoke-NativeCommand -FilePath $packerPath -Arguments (@("validate") + $packerVariables + @("."))
    Write-Pass "Packer initialization, formatting, and validation completed"

    if ($ValidateOnly) {
        $terraformParameters["ValidateOnly"] = $true
        & $terraformTestScript @terraformParameters
        Write-Pass "Validation-only mode created no OCI resources"
        return
    }

    if (Test-Path -LiteralPath $ManualCaptureReceiptPath -PathType Leaf) {
        $pendingCapture = Read-ManualCaptureReceipt -Path $ManualCaptureReceiptPath
        throw "A manual image capture is already pending for build instance '$($pendingCapture.build_instance_name)'. Finish that capture and test its image OCID, or terminate the instance and remove the ignored receipt before starting another build."
    }

    if (Test-Path -LiteralPath $ReadyReceiptPath -PathType Leaf) {
        Remove-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath
        Write-Step "Invalidated the previous Ready-for-Marketplace receipt before starting a new build"
    }

    Confirm-TesterSourceCidr -SourceCidr $testerSourceCidr
    Refresh-SecurityTokenTargets -Targets $sessionTargets
    Confirm-PersistentPackerNsg `
        -OciPath $ociPath `
        -CommonArguments $ociCommonArguments `
        -PackerVariableFile $PackerVariableFile `
        -CompartmentOcid $packerCompartmentOcid `
        -SubnetOcid $packerSubnetOcid `
        -SourceCidr $testerSourceCidr

    Remove-Item -LiteralPath $ManifestPath -Force -ErrorAction SilentlyContinue
    if ($PrepareManualCapture) {
        $manualSourceSha256 = Get-ImageSourceDigest -Root $ProjectRoot
        try {
            Invoke-PackerManualCaptureBuild `
                -FilePath $packerPath `
                -Arguments (@("build", "-on-error=abort") + $packerVariables + @(".")) `
                -InstanceName $manualBuildInstanceName
        }
        catch {
            Write-Warning "Manual-capture mode preserves the build VM on any Packer error. Before retrying, inspect and terminate the exact OCI Compute instance '$manualBuildInstanceName' if provisioning did not complete."
            throw
        }

        $completedSourceSha256 = Get-ImageSourceDigest -Root $ProjectRoot
        if (-not [string]::Equals(
                $manualSourceSha256,
                $completedSourceSha256,
                [StringComparison]::Ordinal
            )) {
            throw "Image source files changed while Packer was preparing the manual-capture VM. Terminate '$manualBuildInstanceName' and rerun so the local test contract matches the image contents."
        }

        Refresh-SecurityTokenTargets -Targets $sessionTargets
        $manualInstance = Get-OciInstanceByDisplayName `
            -OciPath $ociPath `
            -CommonArguments $ociCommonArguments `
            -CompartmentOcid $packerCompartmentOcid `
            -InstanceName $manualBuildInstanceName
        if (-not [string]::Equals(
                [string]$manualInstance.'lifecycle-state',
                "RUNNING",
                [StringComparison]::Ordinal
            )) {
            throw "The preserved build instance '$manualBuildInstanceName' is not RUNNING."
        }
        $manualPublicIp = Get-OciInstancePublicIp `
            -OciPath $ociPath `
            -CommonArguments $ociCommonArguments `
            -InstanceOcid ([string]$manualInstance.id)
        Write-ManualCaptureReceipt `
            -Path $ManualCaptureReceiptPath `
            -Name $ImageName `
            -Instance $manualInstance `
            -PublicIp $manualPublicIp `
            -CompartmentOcid $packerCompartmentOcid `
            -ImageCompartmentOcid $packerImageCompartmentOcid `
            -BaseImageOcid $packerBaseImageOcid `
            -Region $packerRegion `
            -SourceSha256 $manualSourceSha256

        Write-Host ""
        Write-Host "MANUAL IMAGE CAPTURE VM READY" -ForegroundColor Yellow
        Write-Host "Build instance name: $manualBuildInstanceName"
        Write-Host "Build instance OCID: $($manualInstance.id)"
        if (-not [string]::IsNullOrWhiteSpace($manualPublicIp)) {
            Write-Host "Build instance public IP: $manualPublicIp"
            Write-Host "Manual SSH: ssh -i `"$($manualCaptureSshAccess.PrivateKeyPath)`" opc@$manualPublicIp"
        }
        Write-Host "Target custom image name: $ImageName"
        Write-Host "Target image compartment: $packerImageCompartmentOcid"
        Write-Host ""
        Write-Host "OCI Console steps:"
        Write-Host "1. Open this exact Compute instance and stop it."
        Write-Host "2. Choose More actions > Create custom image."
        Write-Host "3. Name the image exactly '$ImageName' and use the target image compartment above."
        Write-Host "4. Wait until the custom image is AVAILABLE."
        Write-Host "5. Terminate this preserved build instance and delete its boot volume. The temporary manual SSH key is removed when the VM stops."
        Write-Host "6. Run the same script with -ExistingImageOcid <new-image-ocid> and no InspectionMode."
        Write-Host ""
        Write-Host "The next command runs the full Terraform metadata, service, endpoint, reboot, and cleanup test."
        Write-Host "Inspection mode remains optional after that test passes."
        $PipelineStopwatch.Stop()
        Write-Host ("Total elapsed time: " + (Format-ElapsedTime -Elapsed $PipelineStopwatch.Elapsed))
        return
    }

    try {
        Invoke-NativeCommand -FilePath $packerPath -Arguments (@("build") + $packerVariables + @("."))
    }
    catch {
        $packerFailure = $_.Exception.Message
        if ($packerFailure -match '/20160918/images' -and
            $packerFailure -match 'malformed MIME header line:\s*application/json') {
            throw @"
Packer provisioned the temporary VM, but the OCI Create Image endpoint returned a malformed HTTP response.
This matches HashiCorp packer-plugin-oracle issue #154 and is not an application, Compose, or Terraform failure.
No Packer artifact was produced. Confirm that the temporary instance and boot volume were terminated, then rerun
the same build after the OCI endpoint incident is resolved:
https://github.com/hashicorp/packer-plugin-oracle/issues/154

Original Packer error:
$packerFailure
"@
        }
        throw
    }

    $imageOcid = Get-PackerArtifactId -Path $ManifestPath
    Write-Pass "Packer created custom image '$ImageName' ($imageOcid)"

    Refresh-SecurityTokenTargets -Targets $sessionTargets

    $terraformParameters["ImageOcid"] = $imageOcid
    if ($KeepTestResources) {
        $terraformParameters["KeepTestResources"] = $true
    }

    & $terraformTestScript @terraformParameters

    Write-Host ""
    if ($KeepTestResources) {
        Write-Host "CUSTOM IMAGE TEST PASSED; TEST RESOURCES WERE KEPT" -ForegroundColor Yellow
        Write-Host "Image name: $ImageName"
        Write-Host "Image OCID: $imageOcid"
        Write-Host "Packer build and cleanup: PASS"
        Write-Host "Terraform clean-VM deployment: PASS"
        Write-Host "All declared services and endpoints: PASS"
        Write-Host "Metadata and service-specific checks: PASS"
        Write-Host "Reboot persistence: PASS"
        Write-Host "Test resource cleanup: SKIPPED BY REQUEST"
        Write-Host "Marketplace handoff receipt: NOT CREATED"
        $PipelineStopwatch.Stop()
        Write-Host ("Total elapsed time: " + (Format-ElapsedTime -Elapsed $PipelineStopwatch.Elapsed))
        return
    }

    $readyReceipt = New-ReadyForMarketplaceReceipt `
        -Name $ImageName `
        -ImageOcid $imageOcid `
        -Region $packerRegion
    Write-ReadyForMarketplaceReceipt -Path $ReadyReceiptPath -Receipt $readyReceipt

    Write-Host "READY FOR MARKETPLACE" -ForegroundColor Green
    Write-Host "Image name: $ImageName"
    Write-Host "Image OCID: $imageOcid"
    Write-Host "Packer build and cleanup: PASS"
    Write-Host "Terraform clean-VM deployment: PASS"
    Write-Host "All declared services and endpoints: PASS"
    Write-Host "Metadata and service-specific checks: PASS"
    Write-Host "Reboot persistence: PASS"
    Write-Host "Test resource cleanup: PASS"
    Write-Host "Inspection status: pending"
    Write-Host "Sanitized handoff receipt: $ReadyReceiptPath"
    Write-Host "Marketplace publishing has not been started."
    $PipelineStopwatch.Stop()
    Write-Host ("Total elapsed time: " + (Format-ElapsedTime -Elapsed $PipelineStopwatch.Elapsed))
}
finally {
    Pop-Location
}
}
finally {
    if ($readyReceiptLockAcquired) {
        Exit-ReadyReceiptLock
    }
}
