-- Adds the Njiro Legacy bar drinks (TSh prices) to every hotel that is already set up.
-- Each drink becomes a stock item (same code as the menu item) and a Bar menu item. Stock starts at 0,
-- so drinks stay hidden on the Bar POS until stock is received/transferred into the Bar Store.
-- New hotels get the same data from the setup wizard (default-catalog.ts). Never overwrites existing data.

-- Bar menu categories (posted to Bar Revenue / Beverage Cost).
INSERT INTO "product_categories" ("id", "property_id", "name", "revenue_account_id", "cost_account_id", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", c."name",
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '4300' LIMIT 1),
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '5200' LIMIT 1),
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN (VALUES
  ('Beers'),
  ('Ciders & Alcoholic Coolers'),
  ('Spirits'),
  ('Wines'),
  ('Soft Drinks & Mixers'),
  ('Energy Drinks'),
  ('Juice'),
  ('Water'),
  ('Hot Drinks')
) AS c("name")
ON CONFLICT ("property_id", "name") DO NOTHING;

CREATE TEMP TABLE "bar_drinks" ("category" TEXT, "name" TEXT, "sku" TEXT, "price" DECIMAL(18,4));
INSERT INTO "bar_drinks" VALUES
  ('Beers', 'Safari', 'BEER-01', 5000),
  ('Beers', 'Castle Lite', 'BEER-02', 5000),
  ('Beers', 'Kilimanjaro', 'BEER-03', 5000),
  ('Beers', 'Serengeti Lager Kubwa', 'BEER-04', 5000),
  ('Beers', 'Serengeti Lite', 'BEER-05', 5000),
  ('Beers', 'Heineken Kubwa', 'BEER-06', 5000),
  ('Beers', 'Windhoek', 'BEER-07', 5000),
  ('Beers', 'Desperados', 'BEER-08', 5000),
  ('Ciders & Alcoholic Coolers', 'Savannah Dry', 'CIDR-01', 5000),
  ('Ciders & Alcoholic Coolers', 'Savanna', 'CIDR-02', 5000),
  ('Ciders & Alcoholic Coolers', 'Smirnoff Black Ice', 'CIDR-03', 5000),
  ('Spirits', 'Amarula', 'SPRT-01', 50000),
  ('Spirits', 'Absolut Vodka Ndogo', 'SPRT-02', 20000),
  ('Spirits', 'Ballantine''s', 'SPRT-03', 20000),
  ('Spirits', 'Campari', 'SPRT-04', 25000),
  ('Spirits', 'Captain Morgan', 'SPRT-05', 20000),
  ('Spirits', 'Gordon''s Ndogo', 'SPRT-06', 20000),
  ('Spirits', 'Grant''s Ndogo', 'SPRT-07', 20000),
  ('Spirits', 'J&B Ndogo', 'SPRT-08', 20000),
  ('Spirits', 'Jack Daniel''s', 'SPRT-09', 50000),
  ('Spirits', 'Konyagi Kubwa', 'SPRT-10', 15000),
  ('Spirits', 'Konyagi Ndogo', 'SPRT-11', 10000),
  ('Spirits', 'K-Vant Kubwa', 'SPRT-12', 15000),
  ('Spirits', 'K-Vant Ndogo', 'SPRT-13', 10000),
  ('Spirits', 'Smirnoff Vodka Ndogo', 'SPRT-14', 15000),
  ('Spirits', 'Viceroy', 'SPRT-15', 15000),
  ('Spirits', 'Hanson Choice', 'SPRT-16', 10000),
  ('Spirits', 'Gilbey''s', 'SPRT-17', 15000),
  ('Spirits', 'Diamond Rock', 'SPRT-18', 15000),
  ('Spirits', 'Bongo Don Ndogo', 'SPRT-19', 10000),
  ('Spirits', 'Black & White Ndogo', 'SPRT-20', 20000),
  ('Spirits', 'Jameson Ndogo', 'SPRT-21', 45000),
  ('Spirits', 'Valuer Ndogo', 'SPRT-22', 15000),
  ('Spirits', 'Jaguar Master', 'SPRT-23', 50000),
  ('Spirits', 'Hennessy', 'SPRT-24', 150000),
  ('Wines', 'Francos Wine', 'WINE-01', 30000),
  ('Wines', 'Dodoma Wine', 'WINE-02', 30000),
  ('Wines', 'Dompo', 'WINE-03', 30000),
  ('Wines', 'Drostdy-Hof Red & White Ndogo', 'WINE-04', 15000),
  ('Wines', 'Drostdy-Hof Red & White Kubwa', 'WINE-05', 30000),
  ('Wines', 'Image Red Ndogo', 'WINE-06', 10000),
  ('Wines', 'Lions Hill White & Red', 'WINE-07', 30000),
  ('Wines', 'Mohans Red & White', 'WINE-08', 30000),
  ('Wines', 'Pearly Bay Red & White', 'WINE-09', 30000),
  ('Wines', 'Personal Red & White', 'WINE-10', 30000),
  ('Wines', 'Robertson Red & White', 'WINE-11', 30000),
  ('Wines', 'Serengeti Wine', 'WINE-12', 30000),
  ('Wines', 'Saint Celine', 'WINE-13', 30000),
  ('Wines', 'Four Cousins White & Red', 'WINE-14', 30000),
  ('Wines', 'Heaven Champion', 'WINE-15', 30000),
  ('Soft Drinks & Mixers', 'Alvaro', 'SOFT-01', 3000),
  ('Soft Drinks & Mixers', 'Grand Malt', 'SOFT-02', 5000),
  ('Soft Drinks & Mixers', 'Coca Zero', 'SOFT-03', 3000),
  ('Soft Drinks & Mixers', 'Pepsi Zero', 'SOFT-04', 3000),
  ('Soft Drinks & Mixers', 'Bitter Lemon', 'SOFT-05', 3000),
  ('Soft Drinks & Mixers', 'Coca-Cola', 'SOFT-06', 3000),
  ('Soft Drinks & Mixers', 'Fanta Black', 'SOFT-07', 3000),
  ('Soft Drinks & Mixers', 'Fanta Orange', 'SOFT-08', 3000),
  ('Soft Drinks & Mixers', 'Fanta Passion', 'SOFT-09', 3000),
  ('Soft Drinks & Mixers', 'Fanta Pineapple', 'SOFT-10', 3000),
  ('Soft Drinks & Mixers', 'Ginger Ale', 'SOFT-11', 3000),
  ('Soft Drinks & Mixers', 'Soda Water', 'SOFT-12', 3000),
  ('Soft Drinks & Mixers', 'Tonic Water', 'SOFT-13', 3000),
  ('Soft Drinks & Mixers', 'Sparletta', 'SOFT-14', 3000),
  ('Soft Drinks & Mixers', 'Sprite', 'SOFT-15', 3000),
  ('Soft Drinks & Mixers', 'Stone Tangawizi', 'SOFT-16', 3000),
  ('Energy Drinks', 'Red Bull', 'ENRG-01', 5000),
  ('Energy Drinks', 'Switch', 'ENRG-02', 8000),
  ('Juice', 'Azam Juice', 'JUIC-01', 5000),
  ('Water', 'Sparkling Water', 'WATR-01', 5000),
  ('Water', 'Maji Kubwa', 'WATR-02', 5000),
  ('Water', 'Maji Ndogo', 'WATR-03', 3000),
  ('Hot Drinks', 'Coffee', 'HDRK-01', 2000);

-- Stock items (bottles/pieces).
INSERT INTO "inventory_items" ("id", "property_id", "sku", "name", "unit_of_measure", "reorder_level", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", d."sku", d."name", 'PCS', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN "bar_drinks" d
ON CONFLICT ("property_id", "sku") DO NOTHING;

-- Menu items (stock tracked).
INSERT INTO "products" ("id", "property_id", "category_id", "name", "sku", "product_type", "stock_tracked", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", pc."id", d."name", d."sku", 'STOCKED', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN "bar_drinks" d
JOIN "product_categories" pc ON pc."property_id" = p."id" AND pc."name" = d."category"
ON CONFLICT ("property_id", "sku") DO NOTHING;

INSERT INTO "product_variants" ("id", "product_id", "name", "sku", "base_price", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), pr."id", 'Standard', d."sku", d."price", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "bar_drinks" d
JOIN "products" pr ON pr."sku" = d."sku" AND pr."name" = d."name"
WHERE NOT EXISTS (SELECT 1 FROM "product_variants" v WHERE v."product_id" = pr."id")
ON CONFLICT ("product_id", "sku") DO NOTHING;

-- Bar price list (TSh).
INSERT INTO "outlet_products" ("outlet_id", "product_variant_id", "price", "price_usd", "tax_rate", "available")
SELECT o."id", v."id", d."price", NULL, 0, true
FROM "bar_drinks" d
JOIN "products" pr ON pr."sku" = d."sku" AND pr."name" = d."name"
JOIN "product_variants" v ON v."product_id" = pr."id" AND v."sku" = d."sku"
JOIN LATERAL (
  SELECT po."id" FROM "pos_outlets" po
  WHERE po."property_id" = pr."property_id" AND po."outlet_type" = 'BAR' AND po."active"
  ORDER BY po."created_at" LIMIT 1
) o ON true
ON CONFLICT ("outlet_id", "product_variant_id") DO NOTHING;

DROP TABLE "bar_drinks";
