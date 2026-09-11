# Deploy Peak Gear from the Deploy to Oracle Cloud button

This guide covers the Resource Manager screens that appear after you select the **Deploy to Oracle Cloud** button for Peak Gear. It follows the intended deployment form: the GGSA archive URL is required, while SSH access is optional. Prepare the credentials below before starting because several secrets are displayed only once when they are created.

> **Security:** Do not commit credentials, private keys, auth tokens, Customer Secret Keys, or pre-authenticated request URLs to Git. Do not include them in screenshots, tickets, chat messages, or workshop instructions. Base64 encoding is not encryption.

## What to prepare

Have the following items ready:

- An OCI compartment where you are allowed to create networking, Compute, Autonomous Database, Object Storage, and related resources.
- Capacity and service limits for the reviewed defaults: an `VM.Standard.E5.Flex` VM with 8 OCPUs, 64 GB of memory, and a 300 GB boot volume; plus a paid Autonomous Database with 2 ECPUs and 1 TB of storage.
- Your current public IPv4 address in CIDR form, such as `203.0.113.10/32`.
- An Oracle Container Registry username and auth token with the required image license terms accepted.
- An OCI API-signing private key in PEM format and the matching fingerprint.
- An OCI Customer Secret Key access key and matching secret key.
- The approved direct HTTPS URL for the GGSA archive `V1054826-01.zip`.

Optional: an OpenSSH public key and its matching private key, only if you want direct VM access for administration or troubleshooting.

The OCI tenancy OCID and signed-in user OCID are supplied automatically by Resource Manager. You do not enter them in this form.

## 1. Accept the terms and choose the stack location

1. Select **I have reviewed and accept the Oracle Terms of Use**.
2. Under **Create in compartment**, choose the compartment that will own the Resource Manager stack.
3. Keep the default Terraform version unless the package or OCI Resource Manager explicitly requires another supported version.
4. Select **Next**.

## 2. Complete Location and access

### Region

Choose the OCI region where the stack will create its resources. Confirm that the region has the required Compute capacity, Autonomous Database service, and OCI Generative AI models.

### Compartment

Choose the compartment where the stack will create all resources. This can be the same compartment as the Resource Manager stack. Your user or group must have permission to create and manage every resource used by the deployment.

### Availability domain

Choose an availability domain that belongs to the selected region and has capacity for the selected VM shape.

### Resource name prefix

Enter a short identifier for the resources, or keep `peakgear-lakehouse`. Use 3 to 30 letters, numbers, or hyphens, and begin with a letter.

### Optional SSH public key

Complete this field only if you want to connect to the VM as `opc` for administration or troubleshooting.

- Upload or paste the **public** key, normally the file whose name ends in `.pub`.
- Keep the matching private SSH key on your computer.
- Do not paste the private SSH key into this field.
- To disable SSH access, leave both the SSH public key and SSH source CIDR blank.

To create a dedicated SSH key pair with OpenSSH:

**Windows PowerShell**

```powershell
$keyPath = Join-Path $HOME ".ssh\peakgear"
ssh-keygen -t ed25519 -f $keyPath
Write-Host "Upload this public key: $keyPath.pub"
```

**macOS or Linux**

```bash
key_path="$HOME/.ssh/peakgear"
ssh-keygen -t ed25519 -f "$key_path"
printf 'Upload this public key: %s.pub\n' "$key_path"
```

See [Managing key pairs on Linux instances](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/managingkeypairs.htm) for Oracle's SSH key guidance.

### Optional SSH source CIDR

If you supplied an SSH public key, enter the trusted public IPv4 address that will connect to SSH, followed by `/32`. This should be the public address of your computer or VPN. Leave this field blank when SSH is disabled. Never use `0.0.0.0/0` for SSH.

### Peak Gear application source CIDR

Enter the public IPv4 CIDR that may open Peak Gear on port 8505. A single trusted computer or VPN egress address should use `/32`.

Use `0.0.0.0/0` only for a deliberately public, temporary demo. It exposes the application to the internet.

### Administration tools source CIDR

Enter the trusted public IPv4 CIDR that may open the Gravitino, GoldenGate, and GGSA administration ports. Use your public IP followed by `/32`. The stack does not allow `0.0.0.0/0` here.

To find your current public IPv4 address in the required format:

**Windows PowerShell**

```powershell
$cidr = "{0}/32" -f (Invoke-RestMethod -Uri "https://api.ipify.org").Trim()
$cidr
```

**macOS or Linux**

```bash
printf '%s/32\n' "$(curl -4 -fsS https://api.ipify.org)"
```

If you are connected through a VPN, run the command while connected to that VPN. If your public address changes, update the stack variables and run Apply again before connecting.

### Show advanced options

Keep this option off for the reviewed VM, database, AI, and storage defaults. Enable it only when you know the target tenancy requires different values.

If you enable it, the additional fields are:

- **Peak Gear VM shape:** Keep `VM.Standard.E5.Flex` unless that shape is unavailable and an approved replacement has been tested.
- **VM OCPUs:** The reviewed value is 8; the package requires at least 6.
- **VM memory in GB:** The reviewed value is 64; the package requires at least 48.
- **Boot volume in GB:** The reviewed value is 300; the package requires at least 250.
- **Autonomous Database license model:** Use `LICENSE_INCLUDED` unless the target tenancy is entitled to `BRING_YOUR_OWN_LICENSE`.
- **Autonomous Database ECPUs:** The reviewed value is 2. Increasing it changes cost.
- **Autonomous Database storage in TB:** The reviewed value is 1. Increasing it changes cost.
- **Autonomous Database ADMIN password:** Leave this optional field blank to let the stack generate a password. If supplied, use 12 to 30 characters with uppercase, lowercase, and numeric characters; do not use spaces, quotation marks, or the word `admin`.
- **OCI Generative AI region:** Keep `us-chicago-1` unless every model used by Peak Gear is available in the replacement region.

### GGSA archive URL

Enter the approved direct HTTPS download URL for `V1054826-01.zip`. This is required for the deployment form you are using. It is a file URL, not an IP address or CIDR.

Get the current approved link from the Peak Gear release or lab owner. Do not substitute an arbitrary GGSA archive.

If you are responsible for publishing the approved archive:

1. In the OCI Console, open **Storage**, **Object Storage & Archive Storage**, then **Buckets**.
2. Open the bucket containing the approved `V1054826-01.zip` object.
3. Create an object-level pre-authenticated request that permits reads.
4. Set an expiration date that covers the planned test period.
5. Copy the complete URL when OCI displays it. OCI does not show the full URL again after the dialog closes.

A pre-authenticated request URL is a bearer secret: anyone who has it can download the object until the request expires or is deleted. Never commit the URL to the repository. See [Object Storage pre-authenticated requests](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingpreauthenticatedrequests.htm).

## 3. Complete the required runtime credentials

### Oracle Container Registry username

1. Sign in at [Oracle Container Registry](https://container-registry.oracle.com/).
2. Accept the license terms for every database and GoldenGate image required by Peak Gear.
3. Enter the Oracle account username used for that sign-in, normally the account email address.

### Oracle Container Registry auth token

Open your profile in Oracle Container Registry, generate or retrieve the registry **Auth Token**, and paste it here. Do not enter your Oracle SSO password.

Store a newly generated token immediately in an approved secret manager. Tokens are masked in Resource Manager after submission.

### OCI API private key, Base64 encoded

This field contains the Base64 representation of an OCI **API-signing private key PEM file**. Peak Gear uses the matching API key to authenticate when it creates OCI Generative AI database profiles.

This is not:

- the SSH private key used to connect to the VM;
- the API key's public key;
- the API key fingerprint; or
- encryption of the private key.

Base64 converts the bytes in the PEM file into one line of text so Resource Manager can pass the value to the VM without damaging line breaks. Anyone who obtains the Base64 value can decode the original private key, so protect it exactly as you protect the PEM file.

#### Get or create the API-signing key

1. In the OCI Console, open the Profile menu and select **My profile** or **User settings**.
2. Open **Tokens and keys**, then find **API keys**.
3. Use an existing API key only when you still have its matching private PEM file.
4. Otherwise, select **Add API key**, choose **Generate API key pair**, and download the private key immediately.
5. Record the fingerprint shown by OCI. You will enter it in the next Resource Manager field.

The private file must contain a PEM block beginning with `-----BEGIN PRIVATE KEY-----` or `-----BEGIN RSA PRIVATE KEY-----`. Oracle explains the key pair, fingerprint, and Console process in [Required keys and OCIDs](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm).

#### Convert the private PEM file to Base64

Use the command for your operating system. Replace no hard-coded example path: each command asks for or uses the actual location of the PEM file on your computer.

**Windows PowerShell**

```powershell
$keyPath = Read-Host "Full path to the OCI API private PEM file"
$keyBytes = [IO.File]::ReadAllBytes($keyPath)
[Convert]::ToBase64String($keyBytes) | Set-Clipboard
Write-Host "The single-line Base64 value is now on the clipboard."
```

**macOS**

```bash
read -r -p "Path to the OCI API private PEM file: " key_path
base64 < "$key_path" | tr -d '\r\n' | pbcopy
printf 'The single-line Base64 value is now on the clipboard.\n'
```

**Linux**

```bash
read -r -p "Path to the OCI API private PEM file: " key_path
base64 < "$key_path" | tr -d '\r\n'
```

On Linux, copy the single line printed by the command and paste it into the Resource Manager field. Clipboard utilities differ between Linux desktop environments, so the command does not assume one is installed.

Do not print or paste the result into logs, source files, tickets, or chat. After you paste it into Resource Manager, clear the clipboard if required by your organization's security policy.

### OCI API key fingerprint

Paste the fingerprint for the same API key whose private PEM file you encoded above. Find it in **My profile** or **User settings**, **Tokens and keys**, **API keys**. A fingerprint looks like colon-separated hexadecimal pairs.

The private key and fingerprint must be a matching pair owned by the signed-in OCI user. A fingerprint copied from another key will cause authentication to fail later in the bootstrap process.

### Object Storage access key and secret key

These two fields must come from the same OCI Customer Secret Key. Peak Gear uses this pair for the S3-compatible Object Storage connection used by Gravitino.

1. In the OCI Console, open the Profile menu and select **My profile**.
2. Open **Tokens and keys**, then find **Customer secret keys**.
3. Select **Generate secret key** and give it a recognizable name.
4. Copy the **secret key immediately**. OCI displays it only once.
5. After closing the dialog, reveal and copy the paired **access key** from the Customer secret keys list.
6. Enter the access key in **Object Storage access key** and the one-time secret in **Object Storage secret key**.

These values are not the Oracle Container Registry token and are not the OCI API key. See [Creating a Customer Secret Key](https://docs.oracle.com/en-us/iaas/Content/Identity/access/to_create_a_Customer_Secret_key.htm).

## 4. Review and deploy

1. Select **Next** and review every value.
2. Confirm that the API private key and fingerprint match, the Customer Secret Key pair matches, and the GGSA URL points to the approved archive.
3. Create the stack.
4. Run **Plan** first and review the proposed resources.
5. Run **Apply** only after the Plan succeeds and the proposed cost and resources are acceptable.

The deployment provisions paid OCI resources. Apply can take up to three hours while Peak Gear downloads licensed software, loads Autonomous Database, builds containers, and verifies its services. Keep the browser job page open or return to the stack's Jobs list to monitor Apply. A long sequence of `Still creating` messages only means Resource Manager is waiting; use the phase and diagnostic outputs to determine actual progress.

## 5. Open the application and verify the deployment

After Apply succeeds, open the stack **Outputs** and use:

- `application_url` to open Peak Gear;
- `application_health_url` to check application health;
- `ggsa_url`, `goldengate_studio_url`, and `gravitino_url` for the administration tools; and
- `application_ssh_command` to connect to the VM as `opc`, when SSH was enabled.

For a failed or unusually long bootstrap, use the commands provided in these outputs:

- `bootstrap_log_command`
- `installer_log_command`
- `application_diagnostics_command`
- `database_bootstrap_diagnostics_command`

If SSH was disabled, the stack can still deploy and run, but SSH-based diagnostic commands will not be usable from your computer.

## 6. Clean up

When the demo is no longer needed, run **Destroy** from the Resource Manager stack and confirm that the created Compute, database, networking, and Object Storage resources are removed. An inactive application does not stop OCI resource charges.

## Field summary

| Field | Required | Source |
| --- | --- | --- |
| Region | Yes | Target OCI region |
| Compartment | Yes | OCI compartment picker |
| Availability domain | Yes | Availability domain in the selected region |
| Resource name prefix | Yes | User-defined identifier |
| SSH public key | No | Local OpenSSH `.pub` file when SSH access is wanted |
| SSH source CIDR | Only with SSH | Current trusted public IPv4 address plus `/32` |
| Peak Gear application source CIDR | Yes | Trusted public IPv4 CIDR |
| Administration tools source CIDR | Yes | Trusted public IPv4 CIDR; never `0.0.0.0/0` |
| Show advanced options | Yes | Keep off for the reviewed defaults |
| VM and database advanced fields | Only when advanced options are on | Approved capacity, license, and region choices |
| GGSA archive URL | Yes | Approved direct HTTPS URL for `V1054826-01.zip` |
| Oracle Container Registry username | Yes | Oracle Container Registry account |
| Oracle Container Registry auth token | Yes | Oracle Container Registry profile |
| OCI API private key, Base64 encoded | Yes | Base64 of the current user's API-signing private PEM key |
| OCI API key fingerprint | Yes | OCI profile, Tokens and keys, API keys |
| Object Storage access key | Yes | OCI Customer Secret Key pair |
| Object Storage secret key | Yes | Secret displayed once when that pair is generated |
