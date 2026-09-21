CREATE TABLE IF NOT EXISTS demo_products (
  product_id INT PRIMARY KEY,
  product_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL
);

INSERT INTO demo_products (product_id, product_name, category, unit_price)
VALUES
  (101, 'Trailhead Daypack', 'Packs', 89.99),
  (102, 'Summit Insulated Bottle', 'Hydration', 34.50),
  (103, 'RidgeLine Headlamp', 'Lighting', 59.00)
ON DUPLICATE KEY UPDATE
  product_name = VALUES(product_name),
  category = VALUES(category),
  unit_price = VALUES(unit_price);
