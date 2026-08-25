# Add an Apache Iceberg Catalog Server

## Introduction

**PeakGear** has raw and curated data in the **AI Lakehouse**, but that data only becomes reusable across engines when users can discover the same Iceberg tables through a shared catalog.

**Apache Iceberg** is an open table format for large analytical datasets stored in object storage. It adds a reliable metadata layer around files such as Parquet, enabling capabilities including ACID table changes, schema and partition evolution, and time travel without locking data into one processing engine. This interoperability is why it has become so important: platforms such as Oracle AI Data Platform or Databricks support Iceberg tables and the Iceberg REST catalog, while Snowflake supports Iceberg tables and can act as an Iceberg catalog. Teams can therefore keep one table definition and use it from compatible engines such as Spark, Flink, Trino, and cloud data platforms instead of creating fragile copies for each tool.

An Apache Iceberg catalog separates table metadata from individual processing tools. Instead of every team configuring object-storage paths and table details independently, **Oracle Data Transforms** can connect to one REST catalog and use the namespaces and tables it publishes.

This scene shows the **Process** stage of the AI Lakehouse. You add a new **Apache Iceberg** catalog server connection in Oracle Data Transforms using the values supplied by the LiveStack. The catalog is backed by the LiveStack Iceberg REST service and points Data Transforms at the same governed Iceberg metadata used by the demo.

Estimated Time: **10 minutes**

### Objectives

In this scene, you will:

- Open the **Add Iceberg Catalog Server** demo from the **Process** menu.
- Open Oracle Data Transforms and sign in with the displayed PG credentials.
- Create a new Apache Iceberg catalog-server connection.
- Configure the connection with the LiveStack REST URL and OCI Object Storage credentials.
- Test the connection and confirm that the Iceberg namespace is available.

## Task 1: Open the Add Iceberg Catalog Server demo

Perform the following set of steps to open the **Add Iceberg Catalog Server** demo:

1. In the left sidebar, expand **Process**.
2. Select **Add Iceberg Catalog Server**.
3. Confirm that the page title is **Add Iceberg Catalog Server**.

![1](images/1.png)

The page explains the purpose of the catalog server and shows the values required for the connection. Keep this tab open while you configure Data Transforms.

## Task 2: Review and copy the connection values

The **Login information** panel contains the environment-specific values for this demo.

Note that all required information are displated in the **Login Information** panel:

1. The **Username** and **Password**. These are the PG credentials for Data Transforms.
2. The **REST URL**. This is the URL of the LiveStack Iceberg REST catalog.
3. The **OCI Access ID** and **OCI Secret Key**. Use them only when Data Transforms prompts for OCI Object Storage credentials.

![2](images/2.png)


## Task 3: Open and sign in to Data Transforms

Perform the following set of steps to open **Data Transforms**:

1. Click **Open Data Transforms**.
2. Enter the PG username and password copied from the LiveStack page.
3. Click **Connect**.
4. Keep the LiveStack tab open so that you can return to it when you need to copy a connection value.

![3](images/3.png)

## Task 4: Create an Apache Iceberg connection

Perform the following set of steps to create the catalog-server connection:

1. From the Data Transforms home page, open **Connections**.
2. Click **Create Connection**.
3. Select **Apache Iceberg** as the technology.
4. Provide the following values:

![4](images/4.png)

| Data Transforms setting              | Value                                                |
| --------------------------------------| ------------------------------------------------------|
| Connection Name                      | `My_Iceberg_Catalog`                                 |
| Catalog provider                     | `Generic Rest Catalog`                               |
| Catalog name                         | `default`                                            |
| REST URL                             | Paste the **REST URL** from the LiveStack page       |
| Authentication                       | `None`                                               |
| OCI Region (in Storage Settings)     | Leave empty                                          |
| OCI Access ID (in Storage Settings)  | Paste the **OCI Access ID** from the LiveStack page  |
| OCI Secret Key (in Storage Settings) | Paste the **OCI Secret Key** from the LiveStack page |


![5](images/5.png)


## Task 5: Test and save the connection

Perform the following set of steps to test the catalog-server connection:

1. Click **Test Connection**.
2. Confirm that Data Transforms reports a successful connection.
3. Click **Save** or **Create**.
4. Return to the Connections or Data Servers list and confirm that `My_Iceberg_Catalog` appears as an Apache Iceberg connection.


![6](images/6.png)

## Task 6: Verify catalog server content

Perform the following set of steps to verify that Data Transforms can discover the catalog:

1. In a new browser enter the following URL: **REST URL** from the LiveStack page + `iceberg/v1/namespaces` to display available namespaces on the catalog server

![7](images/7.png)


2. Explore the content of the namespace by appending `/bronze/tables` to the URL. This will display the current tables available in the namespace

![8](images/8.png)

3. Append the table name to the URL, so the complete URL is:  **REST URL** from the LiveStack page + `iceberg/v1/namespaces/bronze/tables/product_master_raw`. This will display all metadata of our Iceberg table


![9](images/9.png)



The exact list of tables can change as the demo data is refreshed. The important result is that the connection can discover the shared Iceberg namespace successfully.

## Conclusion: Business Outcome

The Apache Iceberg catalog server gives PeakGear a shared metadata entry point for Iceberg tables. Data Transforms can discover governed Iceberg data through the REST catalog instead of each project rebuilding table locations and storage configuration.

That makes new processing flows faster to create, keeps table definitions reusable, and gives compatible lakehouse tools a consistent way to work with the same Iceberg data products.

## Acknowledgements

* **Author** - Kevin Lazarz August 2026
* **Contributor** - Eugenio Galiano
* **Last Updated By/Date** - Kevin Lazarz  August 2026
