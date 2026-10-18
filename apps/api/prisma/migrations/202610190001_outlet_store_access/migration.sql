-- Separate access for the Main, Bar and Restaurant stores and the Bar and Restaurant POS outlets.
INSERT INTO "permissions" ("id", "module", "action", "code")
VALUES
    (gen_random_uuid(), 'pos', 'use_bar_outlet', 'pos.outlet.bar'),
    (gen_random_uuid(), 'pos', 'use_restaurant_outlet', 'pos.outlet.restaurant'),
    (gen_random_uuid(), 'inventory', 'main_store', 'inventory.store.main'),
    (gen_random_uuid(), 'inventory', 'bar_store', 'inventory.store.bar'),
    (gen_random_uuid(), 'inventory', 'restaurant_store', 'inventory.store.restaurant')
ON CONFLICT ("code") DO NOTHING;

-- Keep existing access working: anyone who could open POS keeps both outlets, and anyone who could
-- open Inventory keeps every store. The Storekeeper role is limited to the Main Store.
-- Administrators can then untick the outlets and stores each person should not use.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" existing ON existing."id" = rp."permission_id" AND existing."code" = 'pos.view'
CROSS JOIN "permissions" p
WHERE p."code" IN ('pos.outlet.bar', 'pos.outlet.restaurant')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" existing ON existing."id" = rp."permission_id" AND existing."code" = 'inventory.view'
JOIN "roles" r ON r."id" = rp."role_id"
CROSS JOIN "permissions" p
WHERE p."code" = 'inventory.store.main'
   OR (p."code" IN ('inventory.store.bar', 'inventory.store.restaurant') AND r."name" <> 'Storekeeper')
ON CONFLICT DO NOTHING;

INSERT INTO "user_permissions" ("user_id", "permission_id")
SELECT up."user_id", p."id"
FROM "user_permissions" up
JOIN "permissions" existing ON existing."id" = up."permission_id" AND existing."code" = 'pos.view'
CROSS JOIN "permissions" p
WHERE p."code" IN ('pos.outlet.bar', 'pos.outlet.restaurant')
ON CONFLICT DO NOTHING;

INSERT INTO "user_permissions" ("user_id", "permission_id")
SELECT up."user_id", p."id"
FROM "user_permissions" up
JOIN "permissions" existing ON existing."id" = up."permission_id" AND existing."code" = 'inventory.view'
CROSS JOIN "permissions" p
WHERE p."code" IN ('inventory.store.main', 'inventory.store.bar', 'inventory.store.restaurant')
ON CONFLICT DO NOTHING;

-- The kitchen store belongs to the restaurant outlet.
UPDATE "inventory_locations" SET "name" = 'Restaurant Store' WHERE "code" = 'KITCHEN' AND "name" = 'Kitchen Store';
