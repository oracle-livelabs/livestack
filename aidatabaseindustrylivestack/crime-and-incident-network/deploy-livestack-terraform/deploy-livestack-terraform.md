# Take It Home (OCI): Deploy IncidentData

## Introduction

Deploy IncidentData in your own OCI tenancy. The **Deploy to Oracle Cloud** button opens the Terraform package in OCI Resource Manager.

The stack creates an application VM, an Autonomous Database, networking, and a private bucket for login details. Setup downloads the demo assets and loads the synthetic data automatically.

Estimated Time: 45–90 minutes, including setup.

### Objectives

- Deploy IncidentData with Resource Manager.
- Retrieve the generated login and open the application.
- Destroy the deployment when finished.

### Prerequisites

- An OCI tenancy with permission to create the demo resources and IAM policies.
- Sufficient quota and budget for the resources below.
- OCI Generative AI access in the configured inference region for AI exercises.

> **Important:** Apply creates billable resources. Use synthetic data only, and run Destroy when you finish.

## Task 1: Open the deployment button

1. Sign in to the OCI Console.

2. Select **Deploy to Oracle Cloud**:

    [![Deploy to Oracle Cloud](https://oci-resourcemanager-plugin.plugins.oci.oraclecloud.com/latest/deploy-to-oracle-cloud.svg)](https://cloud.oracle.com/resourcemanager/stacks/create?zipUrl=https%3A%2F%2Fgithub.com%2Foracle-livelabs%2Flivestack%2Fraw%2Frefs%2Fheads%2Fmain%2Faidatabaseindustrylivestack%2Fcrime-and-incident-network%2Fstack%2Fincidentdata-resource-manager-root.zip)

3. Confirm that the package name is `incidentdata-resource-manager-root.zip`, and accept the terms shown by the Console.

4. Choose a compartment, enter a stack name, and use Terraform **1.5.x**. Leave the working directory at the ZIP root.

5. Select **Next**.

## Task 2: Configure the stack

1. Review the variables. Keep the defaults unless your tenancy requires different values.

    | Setting | Guidance |
    | --- | --- |
    | Destination compartment | Select the demo compartment. |
    | Region and availability domain | Select a location with VM capacity. The default region is `us-ashburn-1`. |
    | `stack_name` | Use 3–24 lowercase letters, digits, or hyphens, starting with a letter. |
    | Optional SSH access | Supply a public key and trusted IPv4 CIDR, such as your address with `/32`. Leave both blank to disable SSH. |
    | VM sizing | Default: 4 OCPUs, 32 GB RAM, and a 100-GB boot volume. |
    | Database sizing | Default: 2 ECPUs and 100 GB of storage. This is not Free Tier. |
    | AI inference region | Default: `us-chicago-1`. It can differ from the infrastructure region. |

2. Select **Next** and review the settings.

3. Leave **Run apply** selected, then select **Create**.

> **Optional:** Run Plan first if you want to review proposed changes. To do this, clear **Run apply** before creating the stack.

## Task 3: Wait for Apply

1. Open the Apply job. If it has not started, select **Apply** on the stack. Use **Automatically approve**, or select the Plan you reviewed.

2. Open **Logs** to follow setup. The VM downloads the release, imports the data, and starts the application.

3. Wait until the job shows **Succeeded**. Setup can take 45–90 minutes.

> If Apply fails, check the first error in the logs for permissions, quota, or VM capacity issues.

## Task 4: Get the password and open IncidentData

1. Open the successful Apply job and select **Output**.

2. Open `application_credentials_url` while signed into OCI.

3. Find the object named by `application_credentials_file`, such as `<deployment-id>/application-login.json`. Open the deployment folder if necessary.

4. Select **Actions > View object details > Download**. The JSON contains the application URL, username, and password. Keep this file private.

5. Open `application_url` and sign in with the downloaded credentials. The username is `operator`.

6. Confirm that the Welcome page opens. Follow the workshop using the active city shown in the application.

> You need read access to the private bucket and its objects to download the login file.

## Task 5: Destroy the deployment

1. Return to the Resource Manager stack and select **Destroy**.

2. Confirm the operation and wait for **Succeeded**.

3. Check the job log for any resources that remain.

Leave the shared release files untouched. Destroy only the resources managed by your deployment stack.

## Acknowledgements

- **Author** - Oracle LiveLabs Team.
- **Last Updated By/Date** - Oracle LiveLabs Team, November 2026.
