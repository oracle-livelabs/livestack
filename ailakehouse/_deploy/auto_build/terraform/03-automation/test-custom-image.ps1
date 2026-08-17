#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$ImageOcid = "",
    [string]$ImageName = "",
    [string]$VariableFile = "",
    [string]$PublicEndpointsFile = "",
    [string]$PlatformEndpointsFile = "",
    [string]$SshPrivateKeyPath = "",
    [string]$SshUser = "opc",
    [ValidateRange(60, 7200)]
    [int]$WaitSeconds = 3600,
    [switch]$ValidateOnly,
    [switch]$KeepTestResources,
    [switch]$InspectionMode,
    [string]$InspectionId = "",
    [string]$CleanupInspection = "",
    [string]$CleanupFailedTest = "",
    [string]$ShowInspectionInfo = "",
    [switch]$SuppressCleanupCommand
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$TerraformRoot = $PSScriptRoot
$AutomationDirectory = Join-Path $ProjectRoot ".automation"
$NullOutputPath = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { "NUL" } else { "/dev/null" }

if ($SshUser -notmatch '^[a-z_][a-z0-9_-]{0,31}$') {
    throw "SshUser must be a valid Linux user name."
}
if (-not [string]::IsNullOrWhiteSpace($ImageName) -and $ImageName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$') {
    throw "ImageName contains unsupported characters."
}
if ($InspectionMode -and ($ValidateOnly -or $KeepTestResources -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or
        -not [string]::IsNullOrWhiteSpace($CleanupFailedTest) -or
        -not [string]::IsNullOrWhiteSpace($ShowInspectionInfo))) {
    throw "InspectionMode cannot be combined with validation, retained resources, information, or cleanup modes."
}
if (-not [string]::IsNullOrWhiteSpace($InspectionId) -and -not $InspectionMode) {
    throw "InspectionId can only be used with InspectionMode."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupInspection) -and ($ValidateOnly -or $KeepTestResources)) {
    throw "CleanupInspection cannot be combined with ValidateOnly or KeepTestResources."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupFailedTest) -and
    ($ValidateOnly -or $KeepTestResources -or $InspectionMode -or
        -not [string]::IsNullOrWhiteSpace($InspectionId) -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or
        -not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -or
        -not [string]::IsNullOrWhiteSpace($ImageOcid))) {
    throw "CleanupFailedTest cannot be combined with build, test, inspection, or other cleanup modes."
}
if (-not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -and
    ($ValidateOnly -or $KeepTestResources -or
        -not [string]::IsNullOrWhiteSpace($ImageOcid) -or
        -not [string]::IsNullOrWhiteSpace($InspectionId) -or
        -not [string]::IsNullOrWhiteSpace($CleanupInspection) -or
        -not [string]::IsNullOrWhiteSpace($CleanupFailedTest))) {
    throw "ShowInspectionInfo cannot be combined with build, test, inspection, or cleanup modes."
}
if (-not [string]::IsNullOrWhiteSpace($InspectionId) -and $InspectionId -notmatch '^inspection-[0-9]{14}-[0-9]+$') {
    throw "InspectionId must use the generated inspection-YYYYMMDDHHMMSS-PID format."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupInspection) -and $CleanupInspection -notmatch '^inspection-[0-9]{14}-[0-9]+$') {
    throw "CleanupInspection must use the generated inspection-YYYYMMDDHHMMSS-PID format."
}
if (-not [string]::IsNullOrWhiteSpace($CleanupFailedTest) -and $CleanupFailedTest -notmatch '^packer-test-[0-9]{14}-[0-9]+$') {
    throw "CleanupFailedTest must use the generated packer-test-YYYYMMDDHHMMSS-PID format."
}
if (-not [string]::IsNullOrWhiteSpace($ShowInspectionInfo) -and $ShowInspectionInfo -notmatch '^inspection-[0-9]{14}-[0-9]+$') {
    throw "ShowInspectionInfo must use the generated inspection-YYYYMMDDHHMMSS-PID format."
}

function Write-Step {
    param([string]$Message)
    Write-Host "[terraform-test] $Message" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "[terraform-test] PASS: $Message" -ForegroundColor Green
}

function Get-InspectionReceiptPath {
    param([string]$Id)

    if ($Id -notmatch '^inspection-[0-9]{14}-[0-9]+$') {
        throw "Inspection ID is invalid: $Id"
    }

    return Join-Path $AutomationDirectory "$Id.json"
}

function Write-InspectionReceipt {
    param(
        [string]$Path,
        [object]$Receipt
    )

    $json = $Receipt | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($Path, $json)
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

    $displayArguments = @($Arguments | ForEach-Object {
        if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ }
    })
    return ((Split-Path -Leaf $FilePath) + " " + ($displayArguments -join " ")).Trim()
}

function Invoke-NativeCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$CaptureOutput,
        [switch]$SuppressOutput,
        [switch]$SensitiveOutput
    )

    Write-Step (Format-Command -FilePath $FilePath -Arguments $Arguments)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        if ($CaptureOutput) {
            $commandOutput = @(& $FilePath @Arguments 2>&1)
        }
        elseif ($SuppressOutput) {
            & $FilePath @Arguments *> $null
            $commandOutput = @()
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
        if ($CaptureOutput -and -not $SensitiveOutput -and $commandOutput.Count -gt 0) {
            throw "Command failed with exit code ${exitCode}: $($commandOutput -join [Environment]::NewLine)"
        }
        throw "Command failed with exit code ${exitCode}: $(Format-Command -FilePath $FilePath -Arguments $Arguments)"
    }

    if ($CaptureOutput) {
        return (($commandOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
    }
}

function Read-PublicEndpoints {
    param([string]$Path)

    try {
        $configuration = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        throw "Public endpoints file is not valid JSON: $Path"
    }

    if ($null -eq $configuration.public_endpoints) {
        throw "Public endpoints file must contain public_endpoints: $Path"
    }

    $definitions = @($configuration.public_endpoints)
    $validatedDefinitions = @()
    foreach ($definition in $definitions) {
        if ([string]::IsNullOrWhiteSpace([string]$definition.name) -or [string]$definition.name -match '[\r\n\t]') {
            throw "Every public endpoint must have a name."
        }

        $urlTemplate = [string]$definition.url
        if ($urlTemplate -notmatch '^https?://\{host\}:[0-9]+/[^\r\n\t ]*$') {
            throw "Public endpoint URL must look like http://{host}:8080/path: $($definition.name)"
        }

        $resolvedUrl = $urlTemplate.Replace("{host}", "127.0.0.1")
        $uri = $null
        if (-not [Uri]::TryCreate($resolvedUrl, [UriKind]::Absolute, [ref]$uri) -or
            $uri.Scheme -notin @("http", "https") -or
            $uri.Host -ne "127.0.0.1" -or
            -not [string]::IsNullOrWhiteSpace($uri.UserInfo) -or
            $uri.Port -lt 1 -or
            $uri.Port -gt 65535) {
            throw "Public endpoint URL is invalid: $($definition.name)"
        }

        $codes = @($definition.expected_status_codes)
        if ($codes.Count -eq 0) {
            throw "Public endpoint must declare at least one expected status code: $($definition.name)"
        }
        foreach ($code in $codes) {
            if ([int]$code -lt 100 -or [int]$code -gt 599) {
                throw "Public endpoint has an invalid HTTP status code: $($definition.name)"
            }
        }

        $insecureTls = $false
        $insecureTlsProperty = $definition.PSObject.Properties['insecure_tls']
        if ($null -ne $insecureTlsProperty) {
            if ($insecureTlsProperty.Value -isnot [bool]) {
                throw "Public endpoint insecure_tls must be a Boolean when specified: $($definition.name)"
            }
            $insecureTls = [bool]$insecureTlsProperty.Value
        }

        $validatedDefinitions += [pscustomobject]@{
            Name = [string]$definition.name
            UrlTemplate = $urlTemplate
            Port = [int]$uri.Port
            ExpectedStatusCodes = @($codes | ForEach-Object { [int]$_ })
            InsecureTls = $insecureTls
        }
    }

    return $validatedDefinitions
}

function Read-SingleTerraformOutput {
    param(
        [string]$TerraformPath,
        [string]$Name
    )

    $json = Invoke-NativeCommand `
        -FilePath $TerraformPath `
        -Arguments @("output", "-json", $Name) `
        -CaptureOutput `
        -SensitiveOutput
    try {
        $value = $json | ConvertFrom-Json
    }
    catch {
        throw "Terraform output '$Name' is not valid JSON."
    }
    $values = @($value)
    if ($values.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$values[0])) {
        throw "Terraform output '$Name' must contain exactly one value."
    }
    return [string]$values[0]
}

function Get-TerraformStringAssignment {
    param(
        [string]$Path,
        [string]$Name,
        [string]$DefaultValue = ""
    )

    $content = Get-Content -LiteralPath $Path -Raw
    $assignmentPattern = "(?m)^\s*{0}\s*=\s*`"(?<value>[^`"]*)`"\s*(?:#.*)?$" -f [regex]::Escape($Name)
    $matches = @([regex]::Matches($content, $assignmentPattern))
    if ($matches.Count -eq 0) {
        return $DefaultValue
    }
    if ($matches.Count -ne 1) {
        throw "Terraform variable '$Name' must be assigned exactly once in $Path."
    }
    return [string]$matches[0].Groups["value"].Value
}

function Resolve-RelativeIdentityCredentialPath {
    param(
        [string]$Path,
        [string]$ProjectDirectory
    )

    $content = Get-Content -LiteralPath $Path -Raw
    $pattern = '(?m)^(?<prefix>\s*api_private_key_path\s*=\s*")(?<value>[^"]*)(?<suffix>"\s*(?:#.*)?)$'
    $matches = @([regex]::Matches($content, $pattern))
    if ($matches.Count -eq 0) {
        return
    }
    if ($matches.Count -ne 1) {
        throw "Terraform variables must define api_private_key_path at most once."
    }

    $configuredPath = [string]$matches[0].Groups["value"].Value
    if ([string]::IsNullOrWhiteSpace($configuredPath) -or [System.IO.Path]::IsPathRooted($configuredPath)) {
        return
    }

    $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $ProjectDirectory $configuredPath))
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "identity_credentials.api_private_key_path is relative to the Terraform project but the file does not exist: $configuredPath"
    }

    # The temporary tfvars snapshot can live elsewhere; Terraform must receive an absolute path.
    $hclPath = $resolvedPath.Replace('\', '/')
    $replacement = $matches[0].Groups["prefix"].Value + $hclPath + $matches[0].Groups["suffix"].Value
    $content = $content.Substring(0, $matches[0].Index) + $replacement + $content.Substring($matches[0].Index + $matches[0].Length)
    [System.IO.File]::WriteAllText($Path, $content)
}

function Assert-ExistingIdentityCredentialFormat {
    param([string]$Path)

    $content = Get-Content -LiteralPath $Path -Raw
    $modeMatch = [regex]::Match($content, '(?m)^\s*mode\s*=\s*"(?<value>[^"]*)"\s*(?:#.*)?$')
    if (-not $modeMatch.Success -or $modeMatch.Groups["value"].Value -ne "existing") {
        return
    }

    $accessKeyMatch = [regex]::Match($content, '(?m)^\s*s3_access_key_id\s*=\s*"(?<value>[^"]*)"\s*(?:#.*)?$')
    if (-not $accessKeyMatch.Success -or $accessKeyMatch.Groups["value"].Value -notmatch '^[A-Fa-f0-9]{40}$') {
        throw "peakgear_identity_credentials.s3_access_key_id must be the 40-character Access Key shown under OCI User settings > Customer secret keys. Do not use an OCID."
    }
}

function Sync-ExistingIdentityCredentialAccessKey {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    if ((Resolve-Path -LiteralPath $SourcePath).Path -eq (Resolve-Path -LiteralPath $DestinationPath).Path) {
        return
    }

    $sourceContent = Get-Content -LiteralPath $SourcePath -Raw
    $destinationContent = Get-Content -LiteralPath $DestinationPath -Raw
    $modeMatch = [regex]::Match($sourceContent, '(?m)^\s*mode\s*=\s*"(?<value>[^"]*)"\s*(?:#.*)?$')
    if (-not $modeMatch.Success -or $modeMatch.Groups["value"].Value -ne "existing") {
        return
    }

    $pattern = '(?m)^(?<prefix>\s*s3_access_key_id\s*=\s*")(?<value>[^"]*)(?<suffix>"\s*(?:#.*)?)$'
    $sourceMatches = @([regex]::Matches($sourceContent, $pattern))
    $destinationMatches = @([regex]::Matches($destinationContent, $pattern))
    if ($sourceMatches.Count -ne 1 -or $destinationMatches.Count -ne 1) {
        throw "Terraform variables must define s3_access_key_id exactly once when existing identity credentials are used."
    }

    $accessKey = [string]$sourceMatches[0].Groups["value"].Value
    if ($accessKey -notmatch '^[A-Fa-f0-9]{40}$') {
        throw "Current peakgear_identity_credentials.s3_access_key_id must be the 40-character Access Key shown under OCI User settings > Customer secret keys. Do not use an OCID."
    }

    $replacement = $destinationMatches[0].Groups["prefix"].Value + $accessKey + $destinationMatches[0].Groups["suffix"].Value
    $updatedContent = $destinationContent.Substring(0, $destinationMatches[0].Index) + $replacement + $destinationContent.Substring($destinationMatches[0].Index + $destinationMatches[0].Length)
    [System.IO.File]::WriteAllText($DestinationPath, $updatedContent)
    Write-Step "Refreshed the failed-test S3 access-key format from the current ignored variables"
}

function Get-DisposableAcceptanceBucketName {
    param(
        [object[]]$Resources,
        [switch]$AllowMissing
    )

    $buckets = @($Resources | Where-Object {
            [string]$_.mode -eq "managed" -and [string]$_.type -eq "oci_objectstorage_bucket"
        })
    if ($AllowMissing -and $buckets.Count -eq 0) {
        return $null
    }
    if ($buckets.Count -ne 1) {
        throw "Acceptance cleanup expected exactly one managed Object Storage bucket, found $($buckets.Count)."
    }

    $valuesProperty = $buckets[0].PSObject.Properties["values"]
    if ($null -eq $valuesProperty) {
        throw "Acceptance cleanup bucket state does not contain resource values."
    }
    $bucketValues = $valuesProperty.Value
    $nameProperty = $bucketValues.PSObject.Properties["name"]
    if ($null -eq $nameProperty) {
        throw "Acceptance cleanup bucket state does not contain a bucket name."
    }
    $bucketName = [string]$nameProperty.Value
    if ($bucketName -notmatch '^[A-Za-z0-9._-]{1,256}$') {
        throw "Acceptance cleanup bucket name is invalid."
    }

    $tagsProperty = $bucketValues.PSObject.Properties["freeform_tags"]
    $purpose = ""
    if ($null -ne $tagsProperty -and $null -ne $tagsProperty.Value) {
        $purposeProperty = $tagsProperty.Value.PSObject.Properties["Purpose"]
        if ($null -ne $purposeProperty) {
            $purpose = [string]$purposeProperty.Value
        }
    }
    if ($purpose -ne "pre-marketplace-acceptance") {
        throw "Acceptance cleanup stopped because the bucket is not tagged as disposable pre-marketplace data."
    }

    return $bucketName
}

function Clear-DisposableAcceptanceBucketObjects {
    param(
        [object[]]$Resources,
        [string]$TerraformVariableFile,
        [switch]$AllowMissing
    )

    $bucketName = Get-DisposableAcceptanceBucketName -Resources $Resources -AllowMissing:$AllowMissing
    if ([string]::IsNullOrWhiteSpace($bucketName)) {
        Write-Step "No disposable Object Storage bucket exists in this failed workspace."
        return
    }
    $profile = Get-TerraformStringAssignment `
        -Path $TerraformVariableFile `
        -Name "ociConfigProfile" `
        -DefaultValue "DEFAULT"
    $region = Get-TerraformStringAssignment -Path $TerraformVariableFile -Name "ociRegionIdentifier"
    $authMethod = Get-TerraformStringAssignment `
        -Path $TerraformVariableFile `
        -Name "ociAuthMethod" `
        -DefaultValue "APIKey"
    if ([string]::IsNullOrWhiteSpace($profile) -or [string]::IsNullOrWhiteSpace($region)) {
        throw "Acceptance cleanup requires ociConfigProfile and ociRegionIdentifier in $TerraformVariableFile."
    }
    if ($authMethod -notin @("APIKey", "SecurityToken")) {
        throw "Acceptance cleanup supports only APIKey or SecurityToken OCI authentication."
    }

    $ociPath = Resolve-CommandPath -Name "oci"
    $configFile = Resolve-ExistingFile `
        -Path (Join-Path (Join-Path $HOME ".oci") "config") `
        -Label "OCI configuration file"
    $commonArguments = @(
        "--profile", $profile,
        "--config-file", $configFile,
        "--region", $region
    )
    if ($authMethod -eq "SecurityToken") {
        $commonArguments += @("--auth", "security_token")
    }

    Write-Step "Removing objects from disposable acceptance bucket '$bucketName'"
    Invoke-NativeCommand `
        -FilePath $ociPath `
        -Arguments (@("os", "object", "bulk-delete", "--bucket-name", $bucketName, "--force") + $commonArguments) `
        -SuppressOutput
    Write-Pass "Disposable acceptance bucket '$bucketName' was emptied before Terraform destroy"
}

function Get-SshArguments {
    param(
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target,
        [string]$RemoteCommand
    )

    return @(
        "-i", $PrivateKeyPath,
        "-o", "BatchMode=yes",
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "UserKnownHostsFile=$KnownHostsPath",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=3",
        $Target,
        $RemoteCommand
    )
}

function Get-SshPublicKeyIdentity {
    param([string]$Value)

    $parts = @($Value.Trim() -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($parts.Count -lt 2 -or $parts[0] -notmatch '^(ssh-|ecdsa-)') {
        return ""
    }
    return "$($parts[0]) $($parts[1])"
}

function Resolve-TestSshPrivateKey {
    param(
        [string]$RequestedPath,
        [string]$TerraformVariableFile
    )

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        return Resolve-ExistingFile -Path $RequestedPath -Label "SSH private key"
    }

    $content = Get-Content -LiteralPath $TerraformVariableFile -Raw
    $match = [regex]::Match($content, '(?m)^\s*resUserPublicKey\s*=\s*"([^"]+)"\s*$')
    if (-not $match.Success) {
        throw "Terraform variables must define resUserPublicKey, or pass -SshPrivateKeyPath explicitly."
    }
    $expectedIdentity = Get-SshPublicKeyIdentity -Value $match.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($expectedIdentity)) {
        throw "resUserPublicKey is not a supported OpenSSH public key, or pass -SshPrivateKeyPath explicitly."
    }

    $sshDirectory = Join-Path $HOME ".ssh"
    if (Test-Path -LiteralPath $sshDirectory -PathType Container) {
        foreach ($publicKeyFile in @(Get-ChildItem -LiteralPath $sshDirectory -Filter "*.pub" -File | Sort-Object Name)) {
            $candidateIdentity = Get-SshPublicKeyIdentity -Value (Get-Content -LiteralPath $publicKeyFile.FullName -Raw)
            if ($candidateIdentity -ne $expectedIdentity) {
                continue
            }

            $privateKeyPath = $publicKeyFile.FullName.Substring(0, $publicKeyFile.FullName.Length - 4)
            if (Test-Path -LiteralPath $privateKeyPath -PathType Leaf) {
                Write-Step "Selected SSH private key matching resUserPublicKey: $privateKeyPath"
                return $privateKeyPath
            }
        }
    }

    throw "No private key under $sshDirectory matches resUserPublicKey. Pass -SshPrivateKeyPath with the matching private-key path."
}

function Get-ScpArguments {
    param(
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$SourcePath,
        [string]$Target
    )

    return @(
        "-i", $PrivateKeyPath,
        "-o", "BatchMode=yes",
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "UserKnownHostsFile=$KnownHostsPath",
        "-o", "ConnectTimeout=10",
        $SourcePath,
        $Target
    )
}

function Install-RuntimeFiles {
    param(
        [string]$TerraformPath,
        [string]$ScpPath,
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target,
        [string]$AllowedSourceRoot
    )

    $json = Invoke-NativeCommand `
        -FilePath $TerraformPath `
        -Arguments @("output", "-json", "runtime_files") `
        -CaptureOutput `
        -SensitiveOutput
    $parsedFiles = $json | ConvertFrom-Json
    $files = @($parsedFiles | ForEach-Object { $_ })
    if ($files.Count -eq 0) {
        return
    }

    $allowedRoot = [System.IO.Path]::GetFullPath($AllowedSourceRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $remotePaths = @()
    foreach ($file in $files) {
        $sourcePath = Resolve-ExistingFile -Path ([string]$file.source_path) -Label "Runtime source file"
        $sourceFullPath = [System.IO.Path]::GetFullPath($sourcePath)
        if (-not $sourceFullPath.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Runtime source file must stay under the project automation directory: $sourceFullPath"
        }

        $targetName = [string]$file.target_name
        if ($targetName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') {
            throw "Runtime target_name is unsafe: $targetName"
        }
        if ([string]$file.mode -ne "0600") {
            throw "Runtime files must use mode 0600: $targetName"
        }

        $remotePath = "/home/opc/oci-image-pilot/runtime/$targetName"
        $arguments = Get-ScpArguments `
            -PrivateKeyPath $PrivateKeyPath `
            -KnownHostsPath $KnownHostsPath `
            -SourcePath $sourceFullPath `
            -Target "${Target}:$remotePath"
        Invoke-NativeCommand -FilePath $ScpPath -Arguments $arguments -SensitiveOutput
        $remotePaths += $remotePath
    }

    $chmodCommands = @($remotePaths | ForEach-Object { "chmod 0600 $_" }) -join " && "
    $markerRepair = "if test -e /home/opc/oci-image-pilot/ingestion/.oci_wallet_required; then sudo chown opc:opc /home/opc/oci-image-pilot/ingestion/.oci_wallet_required && sudo chmod 0600 /home/opc/oci-image-pilot/ingestion/.oci_wallet_required; fi"
    $remoteCommand = "$chmodCommands && sed -i 's/\r$//' /home/opc/init/*.sh && $markerRepair && systemctl --user reset-failed oci-image-pilot.service && systemctl --user restart --no-block oci-image-pilot.service"
    $arguments = Get-SshArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -Target $Target `
        -RemoteCommand $remoteCommand
    Invoke-NativeCommand -FilePath $SshPath -Arguments $arguments -SensitiveOutput
    Write-Pass "Protected runtime files were staged and first-boot configuration was restarted"
}

function Install-VerificationHarness {
    param(
        [string]$ScpPath,
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target,
        [string]$SourcePath,
        [string]$ServiceTestsPath
    )

    # The verifier is test tooling, not application runtime configuration. Stage
    # the current reviewed contract so an existing image can be retested safely.
    $harnessPath = Resolve-ExistingFile -Path $SourcePath -Label "Acceptance verification harness"
    $remotePath = "/home/opc/oci-image-pilot/tests/run-tests.sh"
    $arguments = Get-ScpArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -SourcePath $harnessPath `
        -Target "${Target}:$remotePath"
    Invoke-NativeCommand -FilePath $ScpPath -Arguments $arguments

    if (-not (Test-Path -LiteralPath $ServiceTestsPath -PathType Container)) {
        throw "Acceptance service-tests folder does not exist: $ServiceTestsPath"
    }
    $serviceTests = @(Get-ChildItem -LiteralPath $ServiceTestsPath -File -Filter "*.sh")
    if ($serviceTests.Count -eq 0) {
        throw "Acceptance service-tests folder contains no shell tests: $ServiceTestsPath"
    }

    $serviceTestsRemotePath = "/home/opc/oci-image-pilot/tests/service-tests"
    $arguments = Get-SshArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -Target $Target `
        -RemoteCommand "mkdir -p $serviceTestsRemotePath && rm -f $serviceTestsRemotePath/*.sh"
    Invoke-NativeCommand -FilePath $SshPath -Arguments $arguments

    foreach ($serviceTest in $serviceTests) {
        if ($serviceTest.Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.sh$') {
            throw "Acceptance service-test filename is unsafe: $($serviceTest.Name)"
        }
        $arguments = Get-ScpArguments `
            -PrivateKeyPath $PrivateKeyPath `
            -KnownHostsPath $KnownHostsPath `
            -SourcePath $serviceTest.FullName `
            -Target "${Target}:$serviceTestsRemotePath/$($serviceTest.Name)"
        Invoke-NativeCommand -FilePath $ScpPath -Arguments $arguments
    }

    $arguments = Get-SshArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -Target $Target `
        -RemoteCommand "chmod 0755 $remotePath $serviceTestsRemotePath/*.sh && sed -i 's/\r$//' $remotePath $serviceTestsRemotePath/*.sh"
    Invoke-NativeCommand -FilePath $SshPath -Arguments $arguments
    Write-Step "Staged the current acceptance verification harness and service tests"
}

function Test-SshConnection {
    param(
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target
    )

    $arguments = Get-SshArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -Target $Target `
        -RemoteCommand "true"

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $SshPath @arguments *> $null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Wait-ForSsh {
    param(
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-SshConnection -SshPath $SshPath -PrivateKeyPath $PrivateKeyPath -KnownHostsPath $KnownHostsPath -Target $Target) {
            return
        }
        Start-Sleep -Seconds 10
    } while ((Get-Date) -lt $deadline)

    throw "SSH did not become available within $TimeoutSeconds seconds: $Target"
}

function Wait-ForSshShutdown {
    param(
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target
    )

    $deadline = (Get-Date).AddSeconds(180)
    do {
        if (-not (Test-SshConnection -SshPath $SshPath -PrivateKeyPath $PrivateKeyPath -KnownHostsPath $KnownHostsPath -Target $Target)) {
            return
        }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    throw "The test VM did not go offline during the reboot check."
}

function Remove-ManualCaptureSshCleanup {
    param(
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target
    )

    # Manual image capture installs a shutdown-only SSH-key cleanup helper.
    # A legacy captured image can retain that helper; remove it from this
    # disposable Terraform VM before its acceptance reboot.
    $remoteCommand = "sudo systemctl disable oci-manual-capture-remove-ssh-key.service 2>/dev/null || true; sudo rm -f /etc/oci-manual-capture-ssh-public-key /etc/systemd/system/oci-manual-capture-remove-ssh-key.service /usr/local/libexec/oci-manual-capture-remove-ssh-key.sh; sudo systemctl daemon-reload"
    $arguments = Get-SshArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -Target $Target `
        -RemoteCommand $remoteCommand
    Invoke-NativeCommand -FilePath $SshPath -Arguments $arguments -SuppressOutput
}

function Invoke-RemoteVerification {
    param(
        [string]$SshPath,
        [string]$PrivateKeyPath,
        [string]$KnownHostsPath,
        [string]$Target,
        [int]$TimeoutSeconds
    )

    $remoteCommand = "/home/opc/oci-image-pilot/tests/run-tests.sh --wait $TimeoutSeconds --expect-source oci"
    $arguments = Get-SshArguments `
        -PrivateKeyPath $PrivateKeyPath `
        -KnownHostsPath $KnownHostsPath `
        -Target $Target `
        -RemoteCommand $remoteCommand
    Invoke-NativeCommand -FilePath $SshPath -Arguments $arguments
}

function Get-HttpStatus {
    param(
        [string]$CurlPath,
        [string]$NullOutputPath,
        [string]$Url,
        [bool]$InsecureTls = $false
    )

    # GoldenGate Studio and GGSA use self-signed TLS and an older TLS stack
    # that macOS .NET cannot negotiate even when certificate validation is
    # disabled. Use curl only for endpoints explicitly marked insecure_tls.
    # Set NO_PROXY through the child environment instead of passing curl's
    # wildcard argument, which PowerShell can expand on macOS.
    if ($InsecureTls) {
        $previousNoProxy = $env:NO_PROXY
        $previousNoProxyLower = $env:no_proxy
        try {
            $env:NO_PROXY = "*"
            $env:no_proxy = "*"
            $arguments = @(
                "--insecure",
                "--silent",
                "--output", $NullOutputPath,
                "--write-out", "%{http_code}",
                "--connect-timeout", "5",
                "--max-time", "15",
                $Url
            )
            $status = (& $CurlPath @arguments 2>$null | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) {
                return "000"
            }
            return $status
        }
        finally {
            if ($null -eq $previousNoProxy) {
                Remove-Item Env:NO_PROXY -ErrorAction SilentlyContinue
            }
            else {
                $env:NO_PROXY = $previousNoProxy
            }
            if ($null -eq $previousNoProxyLower) {
                Remove-Item Env:no_proxy -ErrorAction SilentlyContinue
            }
            else {
                $env:no_proxy = $previousNoProxyLower
            }
        }
    }

    # Use .NET for standard HTTP(S) endpoints so local proxy configuration
    # cannot delay endpoint polling after remote verification succeeds.
    # Windows PowerShell 5.1 does not always load System.Net.Http by default.
    if ($null -eq ("System.Net.Http.HttpClientHandler" -as [type])) {
        Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
    }
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $client = $null
    $response = $null
    try {
        $handler.UseProxy = $false
        $handler.AllowAutoRedirect = $false
        $client = [System.Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(15)
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        return [string][int]$response.StatusCode
    }
    catch {
        return "000"
    }
    finally {
        if ($null -ne $response) {
            $response.Dispose()
        }
        if ($null -ne $client) {
            $client.Dispose()
        }
        $handler.Dispose()
    }
}

function Wait-ForPublicEndpoints {
    param(
        [string]$CurlPath,
        [string]$NullOutputPath,
        [string]$PublicIp,
        [object[]]$Definitions,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    foreach ($definition in $Definitions) {
        $url = $definition.UrlTemplate.Replace("{host}", $PublicIp)
        $allowedCodes = @($definition.ExpectedStatusCodes | ForEach-Object { [string][int]$_ })

        do {
            $status = Get-HttpStatus -CurlPath $CurlPath -NullOutputPath $NullOutputPath -Url $url -InsecureTls:$definition.InsecureTls
            if ($allowedCodes -contains $status) {
                Write-Pass "$($definition.name) is externally reachable at $url"
                break
            }
            Start-Sleep -Seconds 10
        } while ((Get-Date) -lt $deadline)

        if ($allowedCodes -notcontains $status) {
            throw "$($definition.name) did not return an expected HTTP status at $url. Last status: $status"
        }
    }
}

function Invoke-InspectionCleanup {
    param(
        [string]$TerraformPath,
        [string]$Id
    )

    $receiptPath = Get-InspectionReceiptPath -Id $Id
    if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
        throw "Inspection receipt was not found: $receiptPath"
    }

    try {
        $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Inspection receipt is not valid JSON: $receiptPath"
    }

    if ([int]$receipt.schema_version -ne 1 -or [string]$receipt.workspace_name -ne $Id) {
        throw "Inspection receipt does not match inspection '$Id'."
    }

    $imageOcid = [string]$receipt.image_ocid
    if ($imageOcid -notmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Inspection receipt contains an invalid image OCID."
    }

    $snapshotFileName = [string]$receipt.variable_snapshot
    if ([string]::IsNullOrWhiteSpace($snapshotFileName) -or
        [System.IO.Path]::GetFileName($snapshotFileName) -ne $snapshotFileName) {
        throw "Inspection receipt contains an invalid variable snapshot name."
    }
    $snapshotPath = Resolve-ExistingFile `
        -Path (Join-Path $AutomationDirectory $snapshotFileName) `
        -Label "Inspection variable snapshot"

    $inspectionPorts = @($receipt.allowed_tcp_ports | ForEach-Object { [int]$_ } | Sort-Object -Unique)
    if ($inspectionPorts.Count -eq 0 -or @($inspectionPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -gt 0) {
        throw "Inspection receipt contains invalid TCP ports."
    }
    $allowedPortsHcl = "[" + ($inspectionPorts -join ",") + "]"
    $variableArguments = @(
        "-var-file=$snapshotPath",
        "-var=instance_image_id=$imageOcid",
        "-var=use_marketplace_image=false",
        "-var=enable_test_access_nsg=true",
        "-var=expose_login_outputs=false",
        "-var=instance_count=1",
        "-var=allowed_tcp_ports=$allowedPortsHcl"
    )

    $originalWorkspace = (Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "show") -CaptureOutput).Trim()
    $returnWorkspace = if ($originalWorkspace -eq $Id) { "default" } else { $originalWorkspace }
    $workspaceSelected = $false
    $destroyed = $false

    try {
        Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "select", $Id)
        $workspaceSelected = $true
        $stateJson = Invoke-NativeCommand `
            -FilePath $TerraformPath `
            -Arguments @("show", "-json") `
            -CaptureOutput `
            -SensitiveOutput
        try {
            $state = $stateJson | ConvertFrom-Json
        }
        catch {
            throw "Inspection Terraform state is not valid JSON."
        }
        $rootModule = $null
        if ($null -ne $state.PSObject.Properties["values"] -and
            $null -ne $state.values.PSObject.Properties["root_module"]) {
            $rootModule = $state.values.root_module
        }
        $resources = @(Get-InspectionStateResources -Module $rootModule)
        Clear-DisposableAcceptanceBucketObjects `
            -Resources $resources `
            -TerraformVariableFile $snapshotPath `
            -AllowMissing
        Write-Step "Destroying inspection VM and temporary NSG for '$Id'"
        $destroyArguments = @("destroy", "-auto-approve", "-input=false") + $variableArguments
        Invoke-NativeCommand -FilePath $TerraformPath -Arguments $destroyArguments
        $destroyed = $true
    }
    finally {
        if ($workspaceSelected) {
            Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "select", $returnWorkspace) -SuppressOutput
        }
    }

    if ($destroyed) {
        Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "delete", $Id) -SuppressOutput
        Remove-Item -LiteralPath $receiptPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $AutomationDirectory "$Id.tfplan") -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $AutomationDirectory "$Id.known_hosts") -Force -ErrorAction SilentlyContinue
        Write-Pass "Inspection resources and workspace '$Id' were removed"
    }
}

function Get-InspectionStateResources {
    param([object]$Module)

    $resources = @()
    if ($null -eq $Module) {
        return $resources
    }

    $resourceProperty = $Module.PSObject.Properties["resources"]
    if ($null -ne $resourceProperty) {
        $resources += @($resourceProperty.Value)
    }

    $childProperty = $Module.PSObject.Properties["child_modules"]
    if ($null -ne $childProperty) {
        foreach ($child in @($childProperty.Value)) {
            $resources += @(Get-InspectionStateResources -Module $child)
        }
    }

    return $resources
}

function Invoke-FailedTestCleanup {
    param(
        [string]$TerraformPath,
        [string]$Workspace,
        [string]$FallbackVariableFile,
        [int[]]$FallbackPorts
    )

    if ($Workspace -notmatch '^packer-test-[0-9]{14}-[0-9]+$') {
        throw "Failed-test workspace ID is invalid: $Workspace"
    }
    $workspaceOutput = Invoke-NativeCommand `
        -FilePath $TerraformPath `
        -Arguments @("workspace", "list", "-no-color") `
        -CaptureOutput
    $workspaceNames = @(
        $workspaceOutput -split "`r?`n" |
            ForEach-Object { $_.Trim().TrimStart("*").Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if ($workspaceNames -notcontains $Workspace) {
        throw "Failed-test workspace was not found: $Workspace"
    }

    $receiptPath = Join-Path $AutomationDirectory "$Workspace.failed-test.json"
    $snapshotPath = ""
    $imageOcid = ""
    $cleanupPorts = @($FallbackPorts | ForEach-Object { [int]$_ } | Sort-Object -Unique)
    $variableFile = $FallbackVariableFile
    if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
        try {
            $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        }
        catch {
            throw "Failed-test cleanup receipt is not valid JSON: $receiptPath"
        }
        if ([int]$receipt.schema_version -ne 1 -or [string]$receipt.workspace_name -ne $Workspace) {
            throw "Failed-test cleanup receipt does not match workspace '$Workspace'."
        }
        $imageOcid = [string]$receipt.image_ocid
        $cleanupPorts = @($receipt.allowed_tcp_ports | ForEach-Object { [int]$_ } | Sort-Object -Unique)
        $snapshotName = [string]$receipt.variable_snapshot
        if ([string]::IsNullOrWhiteSpace($snapshotName) -or
            [System.IO.Path]::GetFileName($snapshotName) -ne $snapshotName) {
            throw "Failed-test cleanup receipt contains an invalid variable snapshot name."
        }
        $snapshotPath = Resolve-ExistingFile `
            -Path (Join-Path $AutomationDirectory $snapshotName) `
            -Label "Failed-test variable snapshot"
        $variableFile = $snapshotPath
    }

    if ($cleanupPorts.Count -eq 0 -or @($cleanupPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -gt 0) {
        throw "Failed-test cleanup has invalid TCP ports."
    }
    $variableFile = Resolve-ExistingFile -Path $variableFile -Label "Terraform variable file"
    if (-not [string]::IsNullOrWhiteSpace($snapshotPath)) {
        Sync-ExistingIdentityCredentialAccessKey `
            -SourcePath $FallbackVariableFile `
            -DestinationPath $snapshotPath
        Assert-ExistingIdentityCredentialFormat -Path $snapshotPath
    }

    $originalWorkspace = (Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "show") -CaptureOutput).Trim()
    $returnWorkspace = if ($originalWorkspace -eq $Workspace) { "default" } else { $originalWorkspace }
    $workspaceSelected = $false
    $destroyed = $false
    try {
        Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "select", $Workspace)
        $workspaceSelected = $true

        $stateJson = Invoke-NativeCommand `
            -FilePath $TerraformPath `
            -Arguments @("show", "-json") `
            -CaptureOutput `
            -SensitiveOutput
        try {
            $state = $stateJson | ConvertFrom-Json
        }
        catch {
            throw "Failed-test Terraform state is not valid JSON."
        }
        $rootModule = $null
        if ($null -ne $state.PSObject.Properties["values"] -and
            $null -ne $state.values.PSObject.Properties["root_module"]) {
            $rootModule = $state.values.root_module
        }
        $resources = @(Get-InspectionStateResources -Module $rootModule)
        $instances = @($resources | Where-Object {
                [string]$_.mode -eq "managed" -and [string]$_.type -eq "oci_core_instance"
            })
        if ($instances.Count -gt 1) {
            throw "Failed-test workspace '$Workspace' contains more than one VM. Cleanup stopped for safety."
        }
        if ($instances.Count -eq 1) {
            $sourceDetails = @($instances[0].values.source_details)
            if ($sourceDetails.Count -ne 1) {
                throw "Failed-test VM does not contain exactly one image source."
            }
            $stateImageOcid = [string]$sourceDetails[0].source_id
            if (-not [string]::IsNullOrWhiteSpace($imageOcid) -and $stateImageOcid -ne $imageOcid) {
                throw "Failed-test receipt image does not match the VM image in Terraform state."
            }
            $imageOcid = $stateImageOcid
        }
        if ($imageOcid -notmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
            throw "Could not recover a valid image OCID for failed-test workspace '$Workspace'."
        }

        $allowedPortsHcl = "[" + ($cleanupPorts -join ",") + "]"
        $variableArguments = @(
            "-var-file=$variableFile",
            "-var=instance_image_id=$imageOcid",
            "-var=use_marketplace_image=false",
            "-var=enable_test_access_nsg=true",
            "-var=expose_login_outputs=false",
            "-var=instance_count=1",
            "-var=allowed_tcp_ports=$allowedPortsHcl"
        )
        Clear-DisposableAcceptanceBucketObjects `
            -Resources $resources `
            -TerraformVariableFile $variableFile `
            -AllowMissing
        Write-Step "Destroying resources from failed test '$Workspace'"
        Invoke-NativeCommand `
            -FilePath $TerraformPath `
            -Arguments (@("destroy", "-auto-approve", "-input=false") + $variableArguments)

        $destroyedStateJson = Invoke-NativeCommand `
            -FilePath $TerraformPath `
            -Arguments @("show", "-json") `
            -CaptureOutput `
            -SensitiveOutput
        $destroyedState = $destroyedStateJson | ConvertFrom-Json
        $destroyedRoot = $null
        if ($null -ne $destroyedState.PSObject.Properties["values"] -and
            $null -ne $destroyedState.values.PSObject.Properties["root_module"]) {
            $destroyedRoot = $destroyedState.values.root_module
        }
        $remainingManaged = @(
            Get-InspectionStateResources -Module $destroyedRoot |
                Where-Object { [string]$_.mode -eq "managed" }
        )
        if ($remainingManaged.Count -gt 0) {
            throw "Terraform destroy left managed resources in failed-test state."
        }
        $destroyed = $true
    }
    finally {
        if ($workspaceSelected) {
            Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "select", $returnWorkspace) -SuppressOutput
        }
    }

    if ($destroyed) {
        Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "delete", $Workspace) -SuppressOutput
        $remainingWorkspaces = Invoke-NativeCommand `
            -FilePath $TerraformPath `
            -Arguments @("workspace", "list", "-no-color") `
            -CaptureOutput
        if (@($remainingWorkspaces -split "`r?`n" | ForEach-Object { $_.Trim().TrimStart("*").Trim() }) -contains $Workspace) {
            throw "Terraform workspace '$Workspace' still exists after deletion."
        }
        Remove-Item -LiteralPath $receiptPath -Force -ErrorAction SilentlyContinue
        if (-not [string]::IsNullOrWhiteSpace($snapshotPath)) {
            Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath (Join-Path $AutomationDirectory "$Workspace.tfplan") -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $AutomationDirectory "$Workspace.known_hosts") -Force -ErrorAction SilentlyContinue
        Write-Pass "Failed-test resources and workspace '$Workspace' were removed"
    }
}

function Show-InspectionWorkspaceInfo {
    param(
        [string]$TerraformPath,
        [string]$Id
    )

    $receiptPath = Get-InspectionReceiptPath -Id $Id
    if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
        throw "Inspection receipt was not found: $receiptPath"
    }

    try {
        $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Inspection receipt is not valid JSON: $receiptPath"
    }
    if ([int]$receipt.schema_version -ne 1 -or [string]$receipt.workspace_name -ne $Id) {
        throw "Inspection receipt does not match inspection '$Id'."
    }

    $imageOcid = [string]$receipt.image_ocid
    if ($imageOcid -notmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "Inspection receipt contains an invalid image OCID."
    }

    $originalWorkspace = (Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "show") -CaptureOutput).Trim()
    $workspaceSelected = $false
    try {
        Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "select", $Id)
        $workspaceSelected = $true

        $stateJson = Invoke-NativeCommand `
            -FilePath $TerraformPath `
            -Arguments @("show", "-json") `
            -CaptureOutput `
            -SensitiveOutput
        try {
            $state = $stateJson | ConvertFrom-Json
        }
        catch {
            throw "Inspection Terraform state is not valid JSON."
        }

        $valuesProperty = $state.PSObject.Properties["values"]
        if ($null -eq $valuesProperty) {
            throw "Inspection Terraform state has no values."
        }
        $rootProperty = $valuesProperty.Value.PSObject.Properties["root_module"]
        if ($null -eq $rootProperty) {
            throw "Inspection Terraform state has no root module."
        }

        $instances = @(
            Get-InspectionStateResources -Module $rootProperty.Value |
                Where-Object { [string]$_.mode -eq "managed" -and [string]$_.type -eq "oci_core_instance" }
        )
        if ($instances.Count -ne 1) {
            throw "Inspection '$Id' does not contain exactly one VM."
        }

        $sourceDetails = @($instances[0].values.source_details)
        if ($sourceDetails.Count -ne 1 -or [string]$sourceDetails[0].source_id -ne $imageOcid) {
            throw "Inspection '$Id' does not use the image recorded in its receipt."
        }

        $publicIp = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "test_instance_public_ips"
        $applicationUrl = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "application_url"
        $dashboardUrl = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "dashboard_url"
        $dashboardUser = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "dashboard_user"
        $dashboardPassword = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "vnc_password"
        $databaseUser = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "database_user"
        $databasePassword = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "app_user_password"
        $adbService = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "adb_service"
        $sshCommand = Read-SingleTerraformOutput -TerraformPath $TerraformPath -Name "ssh_command"

        $receipt.status = "ready"
        $receipt.public_ip = $publicIp
        Write-InspectionReceipt -Path $receiptPath -Receipt $receipt

        $imageName = ""
        if ($null -ne $receipt.PSObject.Properties["image_name"]) {
            $imageName = [string]$receipt.image_name
        }

        Write-Host ""
        Write-Host "PEAK GEAR INSPECTION LOGIN INFO" -ForegroundColor Green
        Write-Host "Inspection ID: $Id"
        if (-not [string]::IsNullOrWhiteSpace($imageName)) {
            Write-Host "Image name: $imageName"
        }
        Write-Host "Image OCID: $imageOcid"
        Write-Host "Public IP: $publicIp"
        Write-Host "Peak Gear application: $applicationUrl"
        Write-Host "Runtime service dashboard: $dashboardUrl"
        Write-Host "ADB service: $adbService"
        Write-Host "Dashboard username: $dashboardUser"
        Write-Host "Dashboard password: $dashboardPassword"
        Write-Host "Database username: $databaseUser"
        Write-Host "Database password: $databasePassword"
        Write-Host "SSH: $sshCommand"
        Write-Host "Treat the displayed login values as sensitive."
    }
    finally {
        if ($workspaceSelected) {
            Invoke-NativeCommand -FilePath $TerraformPath -Arguments @("workspace", "select", $originalWorkspace) -SuppressOutput
        }
    }
}

$terraformPath = Resolve-CommandPath -Name "terraform"
if (-not [string]::IsNullOrWhiteSpace($ShowInspectionInfo)) {
    Push-Location $TerraformRoot
    try {
        Invoke-NativeCommand -FilePath $terraformPath -Arguments @("init", "-input=false")
        Show-InspectionWorkspaceInfo -TerraformPath $terraformPath -Id $ShowInspectionInfo
    }
    finally {
        Pop-Location
    }
    return
}
if (-not [string]::IsNullOrWhiteSpace($CleanupInspection)) {
    Push-Location $TerraformRoot
    try {
        Invoke-NativeCommand -FilePath $terraformPath -Arguments @("init", "-input=false")
        Invoke-InspectionCleanup -TerraformPath $terraformPath -Id $CleanupInspection
    }
    finally {
        Pop-Location
    }
    return
}

if ([string]::IsNullOrWhiteSpace($VariableFile)) {
    $VariableFile = Join-Path (Join-Path $ProjectRoot "01-edit") "terraform.tfvars"
}
if ([string]::IsNullOrWhiteSpace($PublicEndpointsFile)) {
    $workspaceRoot = $PSScriptRoot
    1..3 | ForEach-Object { $workspaceRoot = Split-Path -Parent $workspaceRoot }
    $PublicEndpointsFile = Join-Path $workspaceRoot "demo-code"
    $PublicEndpointsFile = Join-Path $PublicEndpointsFile "imagebuild"
    $PublicEndpointsFile = Join-Path $PublicEndpointsFile "peak-gear-livestack"
    $PublicEndpointsFile = Join-Path $PublicEndpointsFile "01-image-build"
    $PublicEndpointsFile = Join-Path $PublicEndpointsFile "01-edit"
    $PublicEndpointsFile = Join-Path $PublicEndpointsFile "public-endpoints.json"
}
$VariableFile = Resolve-ExistingFile -Path $VariableFile -Label "Terraform variable file"
$PublicEndpointsFile = Resolve-ExistingFile -Path $PublicEndpointsFile -Label "Public endpoints file"
if ([string]::IsNullOrWhiteSpace($PlatformEndpointsFile)) {
    $demoProjectRoot = Split-Path -Parent (Split-Path -Parent $PublicEndpointsFile)
    $PlatformEndpointsFile = Join-Path (Join-Path (Join-Path $demoProjectRoot "03-automation") "dashboard") "public-endpoints.json"
}
$PlatformEndpointsFile = Resolve-ExistingFile -Path $PlatformEndpointsFile -Label "Platform endpoints file"
$publicEndpoints = @(
    @(Read-PublicEndpoints -Path $PublicEndpointsFile) +
    @(Read-PublicEndpoints -Path $PlatformEndpointsFile)
)
$endpointNames = @($publicEndpoints | ForEach-Object { $_.Name })
if (@($endpointNames | Sort-Object -Unique).Count -ne $endpointNames.Count) {
    throw "Application and platform endpoint names must be unique."
}
$portCandidates = @(22)
$portCandidates += @($publicEndpoints | ForEach-Object { [int]$_.Port })
$automatedTestPorts = @($portCandidates | Sort-Object -Unique)
$allowedPortsHcl = "[" + ($automatedTestPorts -join ",") + "]"
Write-Pass "Restricted test ports derived from SSH and public endpoints: $($automatedTestPorts -join ', ')"

if (Get-Content -LiteralPath $VariableFile | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '<[^>]+>' }) {
    throw "Terraform variable file still contains placeholder values: $VariableFile"
}

Push-Location $TerraformRoot
try {
    Invoke-NativeCommand -FilePath $terraformPath -Arguments @("init", "-input=false")
    if (-not [string]::IsNullOrWhiteSpace($CleanupFailedTest)) {
        Invoke-FailedTestCleanup `
            -TerraformPath $terraformPath `
            -Workspace $CleanupFailedTest `
            -FallbackVariableFile $VariableFile `
            -FallbackPorts $automatedTestPorts
        return
    }
    Invoke-NativeCommand -FilePath $terraformPath -Arguments @("fmt", "-check", "-recursive", $ProjectRoot)
    Invoke-NativeCommand -FilePath $terraformPath -Arguments @("validate")
    Write-Pass "Terraform initialization, formatting, and validation completed"

    if ($ValidateOnly) {
        Write-Pass "Validation-only mode created no OCI resources"
        return
    }

    if ($ImageOcid -notmatch '^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$') {
        throw "ImageOcid must be a complete OCI image OCID."
    }
    $SshPrivateKeyPath = Resolve-TestSshPrivateKey `
        -RequestedPath $SshPrivateKeyPath `
        -TerraformVariableFile $VariableFile
    $sshPath = Resolve-CommandPath -Name "ssh"
    $scpPath = Resolve-CommandPath -Name "scp"
    if (-not $InspectionMode) {
        $curlPath = Resolve-ApplicationPath -Names @("curl.exe", "curl")
    }

    New-Item -ItemType Directory -Path $AutomationDirectory -Force | Out-Null
    if ($InspectionMode) {
        if ([string]::IsNullOrWhiteSpace($InspectionId)) {
            $InspectionId = "inspection-{0}-{1}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss"), $PID
        }
        $workspaceName = $InspectionId
    }
    else {
        $workspaceName = "packer-test-{0}-{1}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss"), $PID
    }
    $planPath = Join-Path $AutomationDirectory "$workspaceName.tfplan"
    $knownHostsPath = Join-Path $AutomationDirectory "$workspaceName.known_hosts"
    $receiptPath = if ($InspectionMode) { Get-InspectionReceiptPath -Id $InspectionId } else { "" }
    $failedTestReceiptPath = if ($InspectionMode) { "" } else { Join-Path $AutomationDirectory "$workspaceName.failed-test.json" }
    $variableSnapshotPath = Join-Path $AutomationDirectory "$workspaceName.tfvars"
    if ((Test-Path -LiteralPath $variableSnapshotPath) -or
        ($InspectionMode -and (Test-Path -LiteralPath $receiptPath)) -or
        (-not $InspectionMode -and (Test-Path -LiteralPath $failedTestReceiptPath))) {
        throw "Workspace '$workspaceName' already has local automation files. Clean it up or use a new run."
    }
    Copy-Item -LiteralPath $VariableFile -Destination $variableSnapshotPath
    Resolve-RelativeIdentityCredentialPath `
        -Path $variableSnapshotPath `
        -ProjectDirectory $ProjectRoot
    Assert-ExistingIdentityCredentialFormat -Path $variableSnapshotPath
    $effectiveVariableFile = $variableSnapshotPath
    $originalWorkspace = (Invoke-NativeCommand -FilePath $terraformPath -Arguments @("workspace", "show") -CaptureOutput).Trim()
    $workspaceCreated = $false
    $applyStarted = $false
    $testsPassed = $false
    $inspectionReady = $false
    $destroyed = $false
    $publicIp = ""
    $inspectionDatabaseUser = ""
    $inspectionDatabasePassword = ""
    $inspectionDashboardPassword = ""

    $variableArguments = @(
        "-var-file=$effectiveVariableFile",
        "-var=instance_image_id=$ImageOcid",
        "-var=use_marketplace_image=false",
        "-var=enable_test_access_nsg=true",
        "-var=enable_data_transforms_public_test_ingress=true",
        "-var=expose_login_outputs=false",
        "-var=instance_count=1",
        "-var=allowed_tcp_ports=$allowedPortsHcl"
    )

    try {
        Invoke-NativeCommand -FilePath $terraformPath -Arguments @("workspace", "new", $workspaceName)
        $workspaceCreated = $true

        if ($InspectionMode) {
            $inspectionReceipt = [ordered]@{
                schema_version = 1
                inspection_id = $InspectionId
                workspace_name = $workspaceName
                image_ocid = $ImageOcid
                image_name = $ImageName
                created_utc = (Get-Date).ToUniversalTime().ToString("o")
                status = "provisioning"
                public_ip = ""
                variable_snapshot = (Split-Path -Leaf $variableSnapshotPath)
                allowed_tcp_ports = @($automatedTestPorts)
            }
            Write-InspectionReceipt -Path $receiptPath -Receipt $inspectionReceipt
        }
        else {
            $failedTestReceipt = [ordered]@{
                schema_version = 1
                workspace_name = $workspaceName
                image_ocid = $ImageOcid
                variable_snapshot = (Split-Path -Leaf $variableSnapshotPath)
                allowed_tcp_ports = @($automatedTestPorts)
            }
            Write-InspectionReceipt -Path $failedTestReceiptPath -Receipt $failedTestReceipt
        }

        $planArguments = @("plan", "-input=false", "-out=$planPath") + $variableArguments
        Invoke-NativeCommand -FilePath $terraformPath -Arguments $planArguments

        $applyStarted = $true
        Invoke-NativeCommand -FilePath $terraformPath -Arguments @("apply", "-input=false", $planPath)

        $publicIpJson = Invoke-NativeCommand `
            -FilePath $terraformPath `
            -Arguments @("output", "-json", "test_instance_public_ips") `
            -CaptureOutput
        $parsedPublicIps = $publicIpJson | ConvertFrom-Json
        $publicIps = @($parsedPublicIps | ForEach-Object { $_ })
        if ($publicIps.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$publicIps[0])) {
            throw "Terraform did not return exactly one test VM public IP."
        }

        $publicIp = [string]$publicIps[0]
        $parsedPublicIp = $null
        if (-not [System.Net.IPAddress]::TryParse($publicIp, [ref]$parsedPublicIp) -or
            $parsedPublicIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
            throw "Terraform returned an invalid IPv4 address for the test VM."
        }
        $target = "${SshUser}@${publicIp}"
        Write-Step "Waiting for SSH before staging protected runtime files on $target"
        Wait-ForSsh `
            -SshPath $sshPath `
            -PrivateKeyPath $SshPrivateKeyPath `
            -KnownHostsPath $knownHostsPath `
            -Target $target `
            -TimeoutSeconds $WaitSeconds
        Remove-ManualCaptureSshCleanup `
            -SshPath $sshPath `
            -PrivateKeyPath $SshPrivateKeyPath `
            -KnownHostsPath $knownHostsPath `
            -Target $target
        Install-RuntimeFiles `
            -TerraformPath $terraformPath `
            -ScpPath $scpPath `
            -SshPath $sshPath `
            -PrivateKeyPath $SshPrivateKeyPath `
            -KnownHostsPath $knownHostsPath `
            -Target $target `
            -AllowedSourceRoot $AutomationDirectory

        if ($InspectionMode) {
            $inspectionReceipt.status = "ready"
            $inspectionReceipt.public_ip = $publicIp
            Write-InspectionReceipt -Path $receiptPath -Receipt $inspectionReceipt
            $inspectionReady = $true
            $inspectionDatabaseUser = Read-SingleTerraformOutput `
                -TerraformPath $terraformPath `
                -Name "database_user"
            $inspectionDatabasePassword = Read-SingleTerraformOutput `
                -TerraformPath $terraformPath `
                -Name "app_user_password"
            $inspectionDashboardPassword = Read-SingleTerraformOutput `
                -TerraformPath $terraformPath `
                -Name "vnc_password"
            Write-Pass "Inspection VM was deployed with fresh Terraform metadata"
        }
        else {
            $verificationHarnessPath = Join-Path `
                (Join-Path (Split-Path -Parent $ProjectRoot) "01-image-build") `
                "03-automation\run-tests.sh"
            $serviceTestsPath = Join-Path `
                (Join-Path (Split-Path -Parent $ProjectRoot) "01-image-build") `
                "02-edit-if-needed\service-tests"
            Install-VerificationHarness `
                -ScpPath $scpPath `
                -SshPath $sshPath `
                -PrivateKeyPath $SshPrivateKeyPath `
                -KnownHostsPath $knownHostsPath `
                -Target $target `
                -SourcePath $verificationHarnessPath `
                -ServiceTestsPath $serviceTestsPath
            Invoke-RemoteVerification `
                -SshPath $sshPath `
                -PrivateKeyPath $SshPrivateKeyPath `
                -KnownHostsPath $knownHostsPath `
                -Target $target `
                -TimeoutSeconds $WaitSeconds
            Wait-ForPublicEndpoints `
                -CurlPath $curlPath `
                -NullOutputPath $NullOutputPath `
                -PublicIp $publicIp `
                -Definitions $publicEndpoints `
                -TimeoutSeconds $WaitSeconds
            Write-Pass "Initial boot verification completed"

            Write-Step "Rebooting the test VM"
            $rebootArguments = Get-SshArguments `
                -PrivateKeyPath $SshPrivateKeyPath `
                -KnownHostsPath $knownHostsPath `
                -Target $target `
                -RemoteCommand "sudo systemctl reboot"
            try {
                Invoke-NativeCommand -FilePath $sshPath -Arguments $rebootArguments -SuppressOutput
            }
            catch {
                Write-Step "SSH disconnected while the reboot command was being processed"
            }

            Wait-ForSshShutdown `
                -SshPath $sshPath `
                -PrivateKeyPath $SshPrivateKeyPath `
                -KnownHostsPath $knownHostsPath `
                -Target $target
            Wait-ForSsh `
                -SshPath $sshPath `
                -PrivateKeyPath $SshPrivateKeyPath `
                -KnownHostsPath $knownHostsPath `
                -Target $target `
                -TimeoutSeconds $WaitSeconds

            Invoke-RemoteVerification `
                -SshPath $sshPath `
                -PrivateKeyPath $SshPrivateKeyPath `
                -KnownHostsPath $knownHostsPath `
                -Target $target `
                -TimeoutSeconds $WaitSeconds
            Wait-ForPublicEndpoints `
                -CurlPath $curlPath `
                -NullOutputPath $NullOutputPath `
                -PublicIp $publicIp `
                -Definitions $publicEndpoints `
                -TimeoutSeconds $WaitSeconds

            $testsPassed = $true
            Write-Pass "Clean boot, metadata, every Compose service, every endpoint, and reboot persistence passed"

            if (-not $KeepTestResources) {
                $stateJson = Invoke-NativeCommand `
                    -FilePath $terraformPath `
                    -Arguments @("show", "-json") `
                    -CaptureOutput `
                    -SensitiveOutput
                try {
                    $state = $stateJson | ConvertFrom-Json
                }
                catch {
                    throw "Terraform state is not valid JSON before acceptance cleanup."
                }
                $rootModule = $null
                if ($null -ne $state.PSObject.Properties["values"] -and
                    $null -ne $state.values.PSObject.Properties["root_module"]) {
                    $rootModule = $state.values.root_module
                }
                $resources = @(Get-InspectionStateResources -Module $rootModule)
                Clear-DisposableAcceptanceBucketObjects `
                    -Resources $resources `
                    -TerraformVariableFile $effectiveVariableFile
                Write-Step "Destroying the isolated test VM and temporary NSG"
                $destroyArguments = @("destroy", "-auto-approve", "-input=false") + $variableArguments
                Invoke-NativeCommand -FilePath $terraformPath -Arguments $destroyArguments
                $destroyed = $true
                Write-Pass "Terraform test resources were destroyed"
            }
            else {
                Write-Step "Test resources were kept because -KeepTestResources was supplied"
            }
        }
    }
    finally {
        Remove-Item -LiteralPath $planPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $knownHostsPath -Force -ErrorAction SilentlyContinue

        if ($workspaceCreated) {
            Invoke-NativeCommand -FilePath $terraformPath -Arguments @("workspace", "select", $originalWorkspace) -SuppressOutput

            if ($destroyed -or -not $applyStarted) {
                Invoke-NativeCommand -FilePath $terraformPath -Arguments @("workspace", "delete", $workspaceName) -SuppressOutput
                Remove-Item -LiteralPath $variableSnapshotPath -Force -ErrorAction SilentlyContinue
                if (-not $InspectionMode) {
                    Remove-Item -LiteralPath $failedTestReceiptPath -Force -ErrorAction SilentlyContinue
                }
            }
            elseif (-not $destroyed) {
                Write-Warning "Terraform workspace '$workspaceName' was preserved for inspection. Its state contains generated secrets."
                if ($InspectionMode) {
                    Write-Warning "Run the printed CleanupInspection command when the inspection is finished."
                }
                else {
                    Write-Warning "Run the paired demo-code build script with -CleanupFailedTest '$workspaceName' after diagnosing the failure."
                }
            }
        }

        if (-not $workspaceCreated -or -not $applyStarted) {
            Remove-Item -LiteralPath $variableSnapshotPath -Force -ErrorAction SilentlyContinue
            if ($InspectionMode) {
                Remove-Item -LiteralPath $receiptPath -Force -ErrorAction SilentlyContinue
            }
            else {
                Remove-Item -LiteralPath $failedTestReceiptPath -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if ($InspectionMode) {
        if (-not $inspectionReady) {
            throw "Inspection VM deployment did not complete."
        }

        Write-Host ""
        Write-Host "INSPECTION VM DEPLOYED" -ForegroundColor Green
        Write-Host "Inspection ID: $InspectionId"
        if (-not [string]::IsNullOrWhiteSpace($ImageName)) {
            Write-Host "Image name: $ImageName"
        }
        Write-Host "Image OCID: $ImageOcid"
        Write-Host "Public IP: $publicIp"
        foreach ($definition in $publicEndpoints) {
            Write-Host ("{0}: {1}" -f $definition.Name, $definition.UrlTemplate.Replace("{host}", $publicIp))
        }
        Write-Host "Dashboard username: opc"
        Write-Host "Dashboard password: $inspectionDashboardPassword"
        Write-Host "Database username: $inspectionDatabaseUser"
        Write-Host "Database password: $inspectionDatabasePassword"

        Write-Host ("SSH: ssh -i `"{0}`" {1}@{2}" -f $SshPrivateKeyPath, $SshUser, $publicIp)
        Write-Host "First-boot configuration may continue for several minutes before the URLs respond."
        Write-Host "Acceptance tests, reboot, and automatic cleanup: SKIPPED FOR INSPECTION"
        Write-Host "Terraform generated fresh metadata for this VM. Treat the displayed login values as sensitive."
        if (-not $SuppressCleanupCommand) {

            if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
                Write-Host "Windows cleanup command:"
                Write-Host ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"{0}`" -CleanupInspection `"{1}`"" -f $PSCommandPath, $InspectionId)
            }
            else {
                Write-Host "Linux/macOS cleanup command:"
                Write-Host ("pwsh -NoProfile -File `"{0}`" -CleanupInspection `"{1}`"" -f $PSCommandPath, $InspectionId)
            }
        }
        return
    }

    if (-not $testsPassed) {
        throw "Custom image verification did not complete."
    }

    Write-Host ""
    Write-Host "CUSTOM IMAGE TEST PASSED" -ForegroundColor Green
    if (-not [string]::IsNullOrWhiteSpace($ImageName)) {
        Write-Host "Image name: $ImageName"
    }
    Write-Host "Image OCID: $ImageOcid"
    Write-Host "Terraform deployment: PASS"
    Write-Host "Metadata and protected runtime configuration: PASS"
    Write-Host "All Compose services and declared endpoints: PASS"
    Write-Host "Service-specific checks: PASS"
    Write-Host "Reboot persistence: PASS"
    Write-Host ("Cleanup: " + $(if ($KeepTestResources) { "SKIPPED BY REQUEST" } else { "PASS" }))
}
finally {
    Pop-Location
}
