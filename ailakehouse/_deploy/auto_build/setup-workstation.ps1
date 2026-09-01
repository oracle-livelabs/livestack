#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$Update
)

$ErrorActionPreference = 'Stop'

if ($CheckOnly -and $Update) {
    throw 'Use either -CheckOnly or -Update, not both.'
}

function Write-Status {
    param([string]$Message)
    Write-Host "[setup] $Message" -ForegroundColor Cyan
}

function Test-Tool {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-Python312 {
    if (Test-Tool 'py') {
        & py -3.12 --version *> $null
        if ($LASTEXITCODE -eq 0) {
            return [pscustomobject]@{ Command = 'py'; Arguments = @('-3.12') }
        }
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
        (Join-Path $env:ProgramFiles 'Python312\python.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return [pscustomobject]@{ Command = $candidate; Arguments = @() }
        }
    }

    return $null
}

function Install-WingetPackage {
    param(
        [string]$PackageId,
        [string]$ToolName
    )

    if (Test-Tool $ToolName) {
        if ($Update -and -not $CheckOnly) {
            Write-Status "Updating $ToolName."
            & winget upgrade --id $PackageId --exact --source winget --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -ne 0) {
                throw "winget could not update $ToolName ($PackageId)."
            }
        }
        else {
            Write-Status "$ToolName is already available."
        }
        return
    }

    if ($CheckOnly) {
        Write-Host "MISSING: $ToolName (winget package $PackageId)" -ForegroundColor Yellow
        return
    }

    Write-Status "Installing $ToolName."
    & winget install --id $PackageId --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install $ToolName ($PackageId)."
    }
}

if ($env:OS -ne 'Windows_NT') {
    throw "Run setup-workstation.ps1 only on Windows. macOS and Linux users run: bash ./setup-workstation.sh"
}

if (-not (Test-Tool 'winget')) {
    throw "Windows App Installer (winget) is required. Install or update App Installer from Microsoft Store, then rerun this script."
}

Install-WingetPackage -PackageId 'Git.Git' -ToolName 'git'
Install-WingetPackage -PackageId 'Hashicorp.Terraform' -ToolName 'terraform'
Install-WingetPackage -PackageId 'Hashicorp.Packer' -ToolName 'packer'

$python312 = Get-Python312
if ($null -eq $python312) {
    if ($CheckOnly) {
        Write-Host 'MISSING: Python 3.12 (winget package Python.Python.3.12)' -ForegroundColor Yellow
    }
    else {
        Write-Status 'Installing Python 3.12.'
        & winget install --id 'Python.Python.3.12' --exact --source winget --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            throw 'winget could not install Python 3.12.'
        }
    }
}
elseif ($Update -and -not $CheckOnly) {
    Write-Status 'Updating Python 3.12.'
    & winget upgrade --id 'Python.Python.3.12' --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw 'winget could not update Python 3.12.'
    }
}

if (-not (Test-Tool 'ssh')) {
    if ($CheckOnly) {
        Write-Host 'MISSING: OpenSSH Client' -ForegroundColor Yellow
    }
    elseif (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "OpenSSH Client is missing. Reopen PowerShell as Administrator and rerun this script."
    }
    else {
        Write-Status 'Installing Windows OpenSSH Client.'
        Add-WindowsCapability -Online -Name 'OpenSSH.Client~~~~0.0.1.0' | Out-Null
    }
}
else {
    Write-Status 'ssh is already available.'
}

if (-not (Test-Tool 'curl.exe')) {
    throw 'curl.exe is missing. Install current Windows updates, then rerun this script.'
}

if (-not $CheckOnly) {
    $python312 = Get-Python312
    if ($null -eq $python312) {
        throw 'Python 3.12 was installed but is not available yet. Open a new PowerShell window and rerun this script.'
    }
    Write-Status 'Installing or updating OCI CLI for the current user.'
    & $python312.Command @($python312.Arguments) -m pip install --user --upgrade pip oci-cli
    if ($LASTEXITCODE -ne 0) {
        throw 'OCI CLI installation failed.'
    }
}

$ociScripts = Join-Path $env:APPDATA 'Python\Python312\Scripts'
if (-not $CheckOnly -and (Test-Path $ociScripts)) {
    $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (($currentUserPath -split ';') -notcontains $ociScripts) {
        [Environment]::SetEnvironmentVariable('Path', (($currentUserPath.TrimEnd(';') + ';' + $ociScripts).TrimStart(';')), 'User')
    }
    if (($env:Path -split ';') -notcontains $ociScripts) {
        $env:Path = "$ociScripts;$env:Path"
    }
}

$required = @('git', 'terraform', 'packer', 'ssh', 'curl.exe', 'py')
$missing = @($required | Where-Object { -not (Test-Tool $_) })
if ($missing.Count -gt 0) {
    Write-Host "Install complete, but open a new PowerShell window before using: $($missing -join ', ')" -ForegroundColor Yellow
}
elseif (-not (Test-Tool 'oci')) {
    Write-Host 'OCI CLI was installed. Open a new PowerShell window before using oci.' -ForegroundColor Yellow
}
else {
    Write-Host 'PASS: Git, Terraform, Packer, Windows PowerShell 5.1, OpenSSH, OCI CLI, Python, and curl are ready.' -ForegroundColor Green
}

Write-Host ''
if ($Update) {
    Write-Host 'Update mode completed for supported tools.'
}
Write-Host 'Next: select an existing OCI API-key profile and fill the ignored project variable files.'
Write-Host 'Set ociAuthMethod = "APIKey" and use the same profile name for Packer and Terraform.'
Write-Host 'Optional token auth: create a NEW profile name with oci session authenticate; never reuse an API-key profile name.'
