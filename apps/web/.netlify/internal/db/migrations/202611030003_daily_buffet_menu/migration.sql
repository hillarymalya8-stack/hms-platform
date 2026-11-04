-- Daily buffet menu: dishes guests can order one by one when they do not take the full buffet.
-- Each dish carries the weekdays it is served (0 = Sunday ... 6 = Saturday; empty = every day) and the POS
-- only offers it on those days. The full Buffet item (BUF-01) is unchanged.
-- New hotels get the same data from the setup wizard (default-catalog.ts). Never overwrites existing data.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "menu_days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

INSERT INTO "product_categories" ("id", "property_id", "name", "revenue_account_id", "cost_account_id", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", c."name",
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '4200' LIMIT 1),
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '5100' LIMIT 1),
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN (VALUES
  ('Buffet Appetizers'),
  ('Buffet Protein & Starch'),
  ('Buffet Veggies & Salads'),
  ('Buffet Dessert')
) AS c("name")
ON CONFLICT ("property_id", "name") DO NOTHING;

CREATE TEMP TABLE "daily_buffet_menu" ("category" TEXT, "name" TEXT, "sku" TEXT, "price" DECIMAL(18,4), "price_usd" DECIMAL(18,4), "menu_days" INTEGER[]);
INSERT INTO "daily_buffet_menu" VALUES
  ('Buffet Appetizers', 'Creamy Mushroom Soup', 'BDA-01', 6000, 3, '{0,2}'),
  ('Buffet Appetizers', 'Pumpkin Soup', 'BDA-02', 6000, 3, '{1,6}'),
  ('Buffet Appetizers', 'Broccoli Soup', 'BDA-03', 6000, 3, '{3}'),
  ('Buffet Appetizers', 'Zesty Spicy Broccoli Soup (with bread rolls)', 'BDA-04', 6000, 3, '{4}'),
  ('Buffet Appetizers', 'Creamy Pumpkin and Leeks Potage Soup', 'BDA-05', 6000, 3, '{5}'),
  ('Buffet Protein & Starch', 'Chicken BBQ', 'BDP-01', 20000, 8, '{0}'),
  ('Buffet Protein & Starch', 'BBQ Chicken Drums', 'BDP-02', 20000, 8, '{2}'),
  ('Buffet Protein & Starch', 'Marinated Roasted Beef Strips', 'BDP-03', 20000, 8, '{0,2}'),
  ('Buffet Protein & Starch', 'Fried Rice', 'BDP-04', 5000, 2, '{0,2}'),
  ('Buffet Protein & Starch', 'Wedges Fries', 'BDP-05', 5000, 2, '{0,2}'),
  ('Buffet Protein & Starch', 'Grilled Chicken Steak', 'BDP-06', 20000, 8, '{1,6}'),
  ('Buffet Protein & Starch', 'Beef Strips in Sauce', 'BDP-07', 20000, 8, '{1,6}'),
  ('Buffet Protein & Starch', 'Plain Rice', 'BDP-08', 5000, 2, '{1,6}'),
  ('Buffet Protein & Starch', 'Chips', 'BDP-09', 5000, 2, '{1,6}'),
  ('Buffet Protein & Starch', 'Goat BBQ', 'BDP-10', 20000, 8, '{3}'),
  ('Buffet Protein & Starch', 'Roasted Chicken Steak', 'BDP-11', 20000, 8, '{3}'),
  ('Buffet Protein & Starch', 'Veggie Spaghetti', 'BDP-12', 5000, 2, '{3}'),
  ('Buffet Protein & Starch', 'French Fries', 'BDP-13', 5000, 2, '{3}'),
  ('Buffet Protein & Starch', 'Paprika Honey Soy Wings', 'BDP-14', 25000, 10, '{4}'),
  ('Buffet Protein & Starch', 'Creamy Beef Fillet Strips', 'BDP-15', 20000, 8, '{4}'),
  ('Buffet Protein & Starch', 'Mashed Potatoes', 'BDP-16', 5000, 2, '{4}'),
  ('Buffet Protein & Starch', 'Chef Seasonal Veggie Pasta', 'BDP-17', 15000, 6, '{4}'),
  ('Buffet Protein & Starch', 'Mixed Veggies Chicken Steak', 'BDP-18', 25000, 10, '{5}'),
  ('Buffet Protein & Starch', 'Swahili Grilled Beef', 'BDP-19', 20000, 8, '{5}'),
  ('Buffet Protein & Starch', 'Vegetable Rice', 'BDP-20', 5000, 2, '{5}'),
  ('Buffet Protein & Starch', 'Chips Mayai', 'BDP-21', 8000, 3, '{5}'),
  ('Buffet Veggies & Salads', 'Chef Choice (Veggies)', 'BDV-01', 10000, 4, '{}'),
  ('Buffet Veggies & Salads', 'Roasted Carrots', 'BDV-02', 10000, 4, '{0,2}'),
  ('Buffet Veggies & Salads', 'Sauteed Spinach', 'BDV-03', 10000, 4, '{0,2}'),
  ('Buffet Veggies & Salads', 'Greek Salad', 'BDV-04', 10000, 4, '{0}'),
  ('Buffet Veggies & Salads', 'Greek Salad', 'BDV-05', 10000, 5, '{2}'),
  ('Buffet Veggies & Salads', 'Mango Salsa', 'BDV-06', 10000, 4, '{0}'),
  ('Buffet Veggies & Salads', 'Mango Salsa', 'BDV-07', 10000, 5, '{2}'),
  ('Buffet Veggies & Salads', 'Spinach', 'BDV-08', 10000, 4, '{1,6}'),
  ('Buffet Veggies & Salads', 'Peas with Coconut', 'BDV-09', 10000, 4, '{1,6}'),
  ('Buffet Veggies & Salads', 'Avocado Salad', 'BDV-10', 10000, 4, '{1,6}'),
  ('Buffet Veggies & Salads', 'Coleslaw Salad', 'BDV-11', 10000, 4, '{1,6}'),
  ('Buffet Veggies & Salads', 'Mixed Veggies', 'BDV-12', 10000, 4, '{3}'),
  ('Buffet Veggies & Salads', 'Roasted Zucchini', 'BDV-13', 10000, 4, '{3}'),
  ('Buffet Veggies & Salads', 'Lettuce Salad', 'BDV-14', 10000, 4, '{3}'),
  ('Buffet Veggies & Salads', 'Swahili Salad', 'BDV-15', 10000, 4, '{3}'),
  ('Buffet Veggies & Salads', 'Creamy Green Beans', 'BDV-16', 10000, 4, '{4}'),
  ('Buffet Veggies & Salads', 'Tropical Fruits Salad', 'BDV-17', 10000, 4, '{4,5}'),
  ('Buffet Veggies & Salads', 'Avocado Bliss', 'BDV-18', 10000, 4, '{4,5}'),
  ('Buffet Veggies & Salads', 'Mix Veggies (Broccoli, Cauliflower and Carrots)', 'BDV-19', 10000, 4, '{5}'),
  ('Buffet Veggies & Salads', 'Spicy Lentils in Coconut Sauce', 'BDV-20', 10000, 4, '{5}'),
  ('Buffet Dessert', 'Ice Cream', 'BDD-01', 10000, 5, '{0,2}'),
  ('Buffet Dessert', 'Ice Cream', 'BDD-02', 15000, 6, '{1,3,6}'),
  ('Buffet Dessert', 'Seasonal Fruits', 'BDD-03', 15000, 6, '{1,6}'),
  ('Buffet Dessert', 'Chocolate Cake', 'BDD-04', 15000, 6, '{3}'),
  ('Buffet Dessert', 'Cake (Red Velvet, Lemon, Chocolate)', 'BDD-05', 15000, 6, '{4,5}');

INSERT INTO "products" ("id", "property_id", "category_id", "name", "sku", "product_type", "stock_tracked", "menu_days", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", pc."id", m."name", m."sku", 'NON_STOCKED', false, m."menu_days", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN "daily_buffet_menu" m
JOIN "product_categories" pc ON pc."property_id" = p."id" AND pc."name" = m."category"
ON CONFLICT ("property_id", "sku") DO NOTHING;

INSERT INTO "product_variants" ("id", "product_id", "name", "sku", "base_price", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), pr."id", 'Standard', m."sku", m."price", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" pr
JOIN "daily_buffet_menu" m ON m."sku" = pr."sku" AND m."name" = pr."name"
WHERE NOT EXISTS (SELECT 1 FROM "product_variants" v WHERE v."product_id" = pr."id")
ON CONFLICT ("product_id", "sku") DO NOTHING;

-- Sold at each hotel's first active restaurant outlet.
INSERT INTO "outlet_products" ("outlet_id", "product_variant_id", "price", "price_usd", "tax_rate", "available")
SELECT o."id", v."id", m."price", m."price_usd", 0, true
FROM "products" pr
JOIN "daily_buffet_menu" m ON m."sku" = pr."sku" AND m."name" = pr."name"
JOIN "product_variants" v ON v."product_id" = pr."id" AND v."sku" = m."sku"
JOIN LATERAL (
  SELECT po."id" FROM "pos_outlets" po
  WHERE po."property_id" = pr."property_id" AND po."outlet_type" = 'RESTAURANT' AND po."active"
  ORDER BY po."created_at" LIMIT 1
) o ON true
ON CONFLICT ("outlet_id", "product_variant_id") DO NOTHING;

DROP TABLE "daily_buffet_menu";
