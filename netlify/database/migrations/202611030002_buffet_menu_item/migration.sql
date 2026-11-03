-- Adds the Buffet (40,000 TZS / $15) to the restaurant menu of every hotel that is already set up.
-- New hotels get it from the setup wizard (default-catalog.ts). Never overwrites existing data.

INSERT INTO "product_categories" ("id", "property_id", "name", "revenue_account_id", "cost_account_id", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'Buffet',
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '4200' LIMIT 1),
  (SELECT a."id" FROM "accounts" a WHERE a."property_id" = p."id" AND a."account_code" = '5100' LIMIT 1),
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
ON CONFLICT ("property_id", "name") DO NOTHING;

INSERT INTO "products" ("id", "property_id", "category_id", "name", "sku", "product_type", "stock_tracked", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", pc."id", 'Buffet', 'BUF-01', 'NON_STOCKED', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
JOIN "product_categories" pc ON pc."property_id" = p."id" AND pc."name" = 'Buffet'
ON CONFLICT ("property_id", "sku") DO NOTHING;

INSERT INTO "product_variants" ("id", "product_id", "name", "sku", "base_price", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), pr."id", 'Standard', 'BUF-01', 40000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" pr
WHERE pr."sku" = 'BUF-01' AND pr."name" = 'Buffet'
  AND NOT EXISTS (SELECT 1 FROM "product_variants" v WHERE v."product_id" = pr."id")
ON CONFLICT ("product_id", "sku") DO NOTHING;

INSERT INTO "outlet_products" ("outlet_id", "product_variant_id", "price", "price_usd", "tax_rate", "available")
SELECT o."id", v."id", 40000, 15, 0, true
FROM "products" pr
JOIN "product_variants" v ON v."product_id" = pr."id" AND v."sku" = 'BUF-01'
JOIN LATERAL (
  SELECT po."id" FROM "pos_outlets" po
  WHERE po."property_id" = pr."property_id" AND po."outlet_type" = 'RESTAURANT' AND po."active"
  ORDER BY po."created_at" LIMIT 1
) o ON true
WHERE pr."sku" = 'BUF-01' AND pr."name" = 'Buffet'
ON CONFLICT ("outlet_id", "product_variant_id") DO NOTHING;
