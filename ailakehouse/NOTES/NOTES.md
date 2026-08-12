



## Data transform join expression
DATABRICKS.RAW_SKU = REGEXP_SUBSTR(BRONZE_DEMAND_SIGNALS.PRODUCT_HINTS,'"([^"]*)"',1,1,NULL,1)


![2026-07-16-004530](images/2026-07-16-004530.png)






These were verified against your running server:
Configuration:
http://<IP>1525/iceberg/v1/config
List namespaces:
http://<IP>:1525/iceberg/v1/namespaces
Load bronze namespace:
http://<IP>:1525/iceberg/v1/namespaces/bronze
List bronze tables:
http://<IP>:1525/iceberg/v1/namespaces/bronze/tables
Load table metadata:
http://<IP>:1525/iceberg/v1/namespaces/bronze/tables/product_master_raw