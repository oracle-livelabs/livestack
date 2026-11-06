CREATE TABLE IF NOT EXISTS demo_products (
  product_id INTEGER PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL
);

INSERT INTO demo_products (product_id, product_name, category, unit_price)
VALUES
  (101, 'Trailhead Daypack', 'Packs', 89.99),
  (102, 'Summit Insulated Bottle', 'Hydration', 34.50),
  (103, 'RidgeLine Headlamp', 'Lighting', 59.00)
ON CONFLICT (product_id) DO UPDATE
SET product_name = EXCLUDED.product_name,
    category = EXCLUDED.category,
    unit_price = EXCLUDED.unit_price;
