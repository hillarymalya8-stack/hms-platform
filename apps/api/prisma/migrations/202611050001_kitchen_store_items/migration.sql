-- Adds the Njiro Legacy kitchen stock items to the Restaurant Store (KITCHEN) of every hotel that is
-- already set up. Each item starts at 0 so staff can receive or transfer stock into it.
-- New hotels get the same items from the setup wizard (default-catalog.ts). Never overwrites existing data.

-- Make sure every hotel has its Restaurant Store.
INSERT INTO "inventory_locations" ("id", "property_id", "code", "name", "location_type", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'KITCHEN', 'Restaurant Store', 'KITCHEN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
ON CONFLICT ("property_id", "code") DO NOTHING;

CREATE TEMP TABLE "kitchen_items" ("sku" TEXT, "name" TEXT, "unit" TEXT);
INSERT INTO "kitchen_items" VALUES
  ('KIT-01', 'Chicken Steak', 'PCS'),
  ('KIT-02', 'Broilers', 'PCS'),
  ('KIT-03', 'Local Chicken', 'PCS'),
  ('KIT-04', 'Beef Steak (Fillet)', 'KG'),
  ('KIT-05', 'Goat Meat (Front Leg)', 'KG'),
  ('KIT-06', 'Goat Meat (Rear Leg)', 'KG'),
  ('KIT-07', 'Large Size Tilapia', 'PCS'),
  ('KIT-08', 'Small Size Tilapia', 'PCS'),
  ('KIT-09', 'Plantains (Mizuzu)', 'PCS'),
  ('KIT-10', 'Lamb Meat', 'KG'),
  ('KIT-11', 'Chicken Wings', 'PCS'),
  ('KIT-12', 'Ugali Portions', 'PORTION'),
  ('KIT-13', 'Rice Portions', 'PORTION'),
  ('KIT-14', 'French Fries Portions', 'PORTION'),
  ('KIT-15', 'Pasta', 'KG'),
  ('KIT-16', 'Eggs', 'PCS'),
  ('KIT-17', 'Sausages', 'PCS'),
  ('KIT-18', 'Fish Fillets', 'PCS'),
  ('KIT-19', 'Soup', 'PORTION'),
  ('KIT-20', 'Pizza', 'PCS'),
  ('KIT-21', 'Tea', 'PORTION'),
  ('KIT-22', 'Coffee', 'PORTION'),
  ('KIT-23', 'Ice Cream', 'PORTION'),
  ('KIT-24', 'Fresh Juice', 'LTR'),
  ('KIT-25', 'Cake', 'PCS'),
  ('KIT-26', 'Milk', 'LTR'),
  ('KIT-27', 'Salads', 'PORTION');

INSERT INTO "inventory_items" ("id", "property_id", "sku", "name", "unit_of_measure", "reorder_level", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", k."sku", k."name", k."unit", 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
CROSS JOIN "kitchen_items" k
ON CONFLICT ("property_id", "sku") DO NOTHING;

-- Zero balance in the Restaurant Store so each item is listed there.
INSERT INTO "inventory_balances" ("id", "item_id", "location_id", "quantity_on_hand", "average_cost", "updated_at")
SELECT gen_random_uuid(), i."id", l."id", 0, 0, CURRENT_TIMESTAMP
FROM "kitchen_items" k
JOIN "inventory_items" i ON i."sku" = k."sku"
JOIN "inventory_locations" l ON l."property_id" = i."property_id" AND l."code" = 'KITCHEN'
ON CONFLICT ("item_id", "location_id") DO NOTHING;

DROP TABLE "kitchen_items";
