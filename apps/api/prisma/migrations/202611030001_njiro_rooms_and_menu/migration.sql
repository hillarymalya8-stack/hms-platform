-- Adds the Njiro Legacy rooms and restaurant menu (TSh and USD prices) to every hotel that is
-- already set up. New hotels get the same data from the setup wizard (default-catalog.ts).
-- Safe to run on an empty database and never overwrites rooms, categories or items that already exist.

-- Room type (rate starts at 0; set it from the admin workspace).
INSERT INTO "room_types" ("id", "property_id", "code", "name", "base_occupancy", "max_occupancy", "base_rate", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'STD', 'Standard Room', 1, 2, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
ON CONFLICT ("property_id", "code") DO NOTHING;

-- Floors.
INSERT INTO "floors" ("id", "property_id", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", f."name", f."sort_order", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN (VALUES
  ('Ground Floor', 0),
  ('First Floor', 1),
  ('Second Floor', 2),
  ('Rooms 1-4', 3)
) AS f("name", "sort_order")
ON CONFLICT ("property_id", "name") DO NOTHING;

-- Rooms.
INSERT INTO "rooms" ("id", "property_id", "room_type_id", "floor_id", "room_number", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", rt."id", fl."id", r."room_number", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN (VALUES
  ('005', 'Ground Floor'),
  ('006', 'Ground Floor'),
  ('007', 'Ground Floor'),
  ('008', 'Ground Floor'),
  ('009', 'Ground Floor'),
  ('010', 'Ground Floor'),
  ('011', 'Ground Floor'),
  ('012', 'Ground Floor'),
  ('013', 'Ground Floor'),
  ('101', 'First Floor'),
  ('102', 'First Floor'),
  ('103', 'First Floor'),
  ('104', 'First Floor'),
  ('105', 'First Floor'),
  ('106', 'First Floor'),
  ('107', 'First Floor'),
  ('108', 'First Floor'),
  ('109', 'First Floor'),
  ('110', 'First Floor'),
  ('201', 'Second Floor'),
  ('202', 'Second Floor'),
  ('203', 'Second Floor'),
  ('204', 'Second Floor'),
  ('205', 'Second Floor'),
  ('206', 'Second Floor'),
  ('207', 'Second Floor'),
  ('208', 'Second Floor'),
  ('209', 'Second Floor'),
  ('210', 'Second Floor'),
  ('1', 'Rooms 1-4'),
  ('2', 'Rooms 1-4'),
  ('3', 'Rooms 1-4'),
  ('4', 'Rooms 1-4')
) AS r("room_number", "floor_name")
JOIN "room_types" rt ON rt."property_id" = p."id" AND rt."code" = 'STD'
LEFT JOIN "floors" fl ON fl."property_id" = p."id" AND fl."name" = r."floor_name"
ON CONFLICT ("property_id", "room_number") DO NOTHING;

-- Menu categories (posted to Restaurant Revenue).
INSERT INTO "product_categories" ("id", "property_id", "name", "revenue_account_id", "cost_account_id", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", c."name",
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '4200' LIMIT 1),
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = c."cost_code" LIMIT 1),
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN (VALUES
  ('Soups', '5100'),
  ('Appetizers', '5100'),
  ('Chicken Lovers', '5100'),
  ('Beef Corner', '5100'),
  ('Salads', '5100'),
  ('Desserts', '5100'),
  ('Hot Beverages', '5200'),
  ('Oven Pizza', '5100'),
  ('Pasta', '5100'),
  ('Tanzania Local Menu', '5100'),
  ('Side Dishes', '5100'),
  ('Vegetarian Options', '5100')
) AS c("name", "cost_code")
ON CONFLICT ("property_id", "name") DO NOTHING;

CREATE TEMP TABLE "njiro_menu" ("category" TEXT, "name" TEXT, "sku" TEXT, "price" DECIMAL(18,4), "price_usd" DECIMAL(18,4));
INSERT INTO "njiro_menu" VALUES
  ('Soups', 'Zesty Spicy Broccoli', 'SOUP-01', 6000, 3),
  ('Soups', 'Creamy Pumpkin and Leek Potage', 'SOUP-02', 6000, 3),
  ('Soups', 'Forest Mushroom Cream', 'SOUP-03', 6000, 3),
  ('Soups', 'Rustic Chicken and Vegetable Broth', 'SOUP-04', 6000, 3),
  ('Appetizers', 'Chicken Nuggets', 'APP-01', 6000, 3),
  ('Appetizers', 'Bruschetta Classica', 'APP-02', 6000, 3),
  ('Chicken Lovers', 'Paprika Honey Soy Wings', 'CHK-01', 25000, 10),
  ('Chicken Lovers', 'Garlic and Herb Crispy Chicken', 'CHK-02', 25000, 10),
  ('Chicken Lovers', 'Coconut Infused Roast Chicken', 'CHK-03', 25000, 10),
  ('Chicken Lovers', 'Mixed Veggies Chicken Steak', 'CHK-04', 25000, 10),
  ('Chicken Lovers', 'Chargrilled Chicken Steak', 'CHK-05', 25000, 10),
  ('Beef Corner', 'Creamy Beef Fillet Strips', 'BEEF-01', 20000, 8),
  ('Beef Corner', 'African Spiced Roast Beef', 'BEEF-02', 20000, 8),
  ('Beef Corner', 'Swahili Grilled Beef', 'BEEF-03', 20000, 8),
  ('Salads', 'Coleslaw Salad', 'SAL-01', 10000, 5),
  ('Salads', 'Garden Fresh Salad', 'SAL-02', 10000, 5),
  ('Salads', 'Tropical Mango Cilantro', 'SAL-03', 10000, 5),
  ('Salads', 'Avocado Bliss', 'SAL-04', 10000, 5),
  ('Salads', 'Tropical Fruits Salad', 'SAL-05', 10000, 5),
  ('Salads', 'Swahili Salad', 'SAL-06', 10000, 5),
  ('Desserts', 'Red Velvet Cake', 'DES-01', 16000, 7),
  ('Desserts', 'Chocolate Cake', 'DES-02', 16000, 7),
  ('Desserts', 'Lemon Cake', 'DES-03', 16000, 7),
  ('Hot Beverages', 'Ginger Tea', 'HOT-01', 5000, 2),
  ('Hot Beverages', 'Tea Masala', 'HOT-02', 5000, 2),
  ('Hot Beverages', 'Black Tea', 'HOT-03', 5000, 2),
  ('Hot Beverages', 'Herbal Tea', 'HOT-04', 5000, 2),
  ('Oven Pizza', 'Margherita Pizza', 'PIZ-01', 25000, 10),
  ('Oven Pizza', 'Mediterranean Pizza', 'PIZ-02', 28000, 12),
  ('Oven Pizza', 'Four Season Pizza (Artichoke, Mushrooms)', 'PIZ-03', 25000, 10),
  ('Oven Pizza', 'BBQ Chicken Pizza', 'PIZ-04', 25000, 10),
  ('Pasta', 'Creamy Coconut Chicken Pasta', 'PAS-01', 15000, 6),
  ('Pasta', 'Savory Beef and Vegetable Pasta', 'PAS-02', 15000, 6),
  ('Pasta', 'Chef''s Seasonal Vegetable Pasta', 'PAS-03', 15000, 6),
  ('Tanzania Local Menu', 'Fries and Sausage', 'LOC-01', 10000, 5),
  ('Tanzania Local Menu', 'Chips Mayai', 'LOC-02', 10000, 5),
  ('Tanzania Local Menu', 'Chips Vuruga', 'LOC-03', 15000, 6),
  ('Tanzania Local Menu', 'Kisinia Pilau (4 portions)', 'LOC-04', 45000, 18),
  ('Side Dishes', 'Plain Ugali', 'SIDE-01', 5000, 2),
  ('Side Dishes', 'Fluffy White Rice', 'SIDE-02', 5000, 2),
  ('Side Dishes', 'Fried Fries', 'SIDE-03', 5000, 2),
  ('Side Dishes', 'Pasta (Side)', 'SIDE-04', 5000, 2),
  ('Side Dishes', 'Creamy Mashed Potatoes', 'SIDE-05', 5000, 2),
  ('Side Dishes', 'Fried Plantains', 'SIDE-06', 2000, 1),
  ('Vegetarian Options', 'Creamy Peas', 'VEG-01', 10000, 5),
  ('Vegetarian Options', 'Seasonal Creamy Veggies', 'VEG-02', 10000, 5),
  ('Vegetarian Options', 'Creamy Green Beans', 'VEG-03', 10000, 5),
  ('Vegetarian Options', 'Spicy Lentils in Coconut Sauce', 'VEG-04', 10000, 5);

-- Menu items.
INSERT INTO "products" ("id", "property_id", "category_id", "name", "sku", "product_type", "stock_tracked", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", pc."id", m."name", m."sku", 'NON_STOCKED', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN "njiro_menu" m
JOIN "product_categories" pc ON pc."property_id" = p."id" AND pc."name" = m."category"
ON CONFLICT ("property_id", "sku") DO NOTHING;

-- One "Standard" variant per new menu item, carrying the TSh price.
INSERT INTO "product_variants" ("id", "product_id", "name", "sku", "base_price", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), pr."id", 'Standard', m."sku", m."price", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "njiro_menu" m
JOIN "products" pr ON pr."sku" = m."sku" AND pr."name" = m."name"
WHERE NOT EXISTS (SELECT 1 FROM "product_variants" v WHERE v."product_id" = pr."id")
ON CONFLICT ("product_id", "sku") DO NOTHING;

-- Restaurant price list: TSh price and USD price.
INSERT INTO "outlet_products" ("outlet_id", "product_variant_id", "price", "price_usd", "tax_rate", "available")
SELECT o."id", v."id", m."price", m."price_usd", 0, true
FROM "njiro_menu" m
JOIN "products" pr ON pr."sku" = m."sku" AND pr."name" = m."name"
JOIN "product_variants" v ON v."product_id" = pr."id" AND v."sku" = m."sku"
JOIN LATERAL (
  SELECT po."id" FROM "pos_outlets" po
  WHERE po."property_id" = pr."property_id" AND po."outlet_type" = 'RESTAURANT' AND po."active"
  ORDER BY po."created_at" LIMIT 1
) o ON true
ON CONFLICT ("outlet_id", "product_variant_id") DO NOTHING;

DROP TABLE "njiro_menu";
