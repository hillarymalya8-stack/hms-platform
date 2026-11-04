-- Staff attribution for sales and stock, and a protected, searchable audit trail.
--
-- * POS orders record who created, last edited and voided them; payments record who collected
--   (and voided) them. Inventory movements record who posted them, the reason and the store
--   balances before and after. Every actor is taken from the logged-in session by the API.
-- * Names are stored as snapshots next to the user id, so history stays readable when a staff
--   account is renamed or disabled.
-- * Older rows are only back-filled where the existing audit trail recorded the logged-in user
--   for that exact record. Everything else stays NULL and is shown as "Not recorded".
-- * Audit trail rows can no longer be edited or deleted.
-- Only adds nullable columns, indexes and triggers; no existing amounts, balances or descriptions change.

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_name" TEXT,
ADD COLUMN IF NOT EXISTS "item_id" UUID,
ADD COLUMN IF NOT EXISTS "item_name" TEXT,
ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "from_quantity_after" DECIMAL(18,4),
ADD COLUMN IF NOT EXISTS "from_quantity_before" DECIMAL(18,4),
ADD COLUMN IF NOT EXISTS "performed_by_name" TEXT,
ADD COLUMN IF NOT EXISTS "performed_by_user_id" UUID,
ADD COLUMN IF NOT EXISTS "reason" TEXT,
ADD COLUMN IF NOT EXISTS "to_quantity_after" DECIMAL(18,4),
ADD COLUMN IF NOT EXISTS "to_quantity_before" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "collected_by_name" TEXT,
ADD COLUMN IF NOT EXISTS "collected_by_user_id" UUID,
ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "voided_by_name" TEXT,
ADD COLUMN IF NOT EXISTS "voided_by_user_id" UUID;

-- AlterTable
ALTER TABLE "pos_orders" ADD COLUMN IF NOT EXISTS "created_by_name" TEXT,
ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID,
ADD COLUMN IF NOT EXISTS "last_edited_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "last_edited_by_name" TEXT,
ADD COLUMN IF NOT EXISTS "last_edited_by_user_id" UUID,
ADD COLUMN IF NOT EXISTS "voided_by_name" TEXT,
ADD COLUMN IF NOT EXISTS "voided_by_user_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_item_id_created_at_idx" ON "audit_logs"("item_id", "created_at");
CREATE INDEX IF NOT EXISTS "inventory_movements_property_id_created_at_idx" ON "inventory_movements"("property_id", "created_at");
CREATE INDEX IF NOT EXISTS "inventory_movements_performed_by_user_id_created_at_idx" ON "inventory_movements"("performed_by_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pos_orders_property_id_created_by_user_id_created_at_idx" ON "pos_orders"("property_id", "created_by_user_id", "created_at");

-- Back-fill: staff names on existing audit entries (the user id was recorded from the login session).
UPDATE "audit_logs" a
SET "actor_name" = u."full_name"
FROM "users" u
WHERE a."user_id" = u."id" AND a."actor_name" IS NULL;

-- Back-fill: seller of older POS orders, from the audit entry written when the order was created.
UPDATE "pos_orders" o
SET "created_by_user_id" = a."user_id", "created_by_name" = a."actor_name"
FROM (
  SELECT DISTINCT ON ("record_id") "record_id", "user_id", "actor_name"
  FROM "audit_logs"
  WHERE "module" = 'pos' AND "action" = 'create_order' AND "record_type" = 'pos_order' AND "user_id" IS NOT NULL
  ORDER BY "record_id", "created_at" ASC
) a
WHERE o."id"::text = a."record_id" AND o."created_by_user_id" IS NULL;

-- Back-fill: last editor of older POS orders.
UPDATE "pos_orders" o
SET "last_edited_by_user_id" = a."user_id", "last_edited_by_name" = a."actor_name", "last_edited_at" = a."created_at"
FROM (
  SELECT DISTINCT ON ("record_id") "record_id", "user_id", "actor_name", "created_at"
  FROM "audit_logs"
  WHERE "module" = 'pos' AND "action" = 'edit_order' AND "record_type" = 'pos_order' AND "user_id" IS NOT NULL
  ORDER BY "record_id", "created_at" DESC
) a
WHERE o."id"::text = a."record_id" AND o."last_edited_by_user_id" IS NULL;

-- Back-fill: who voided older POS orders (and their payments).
UPDATE "pos_orders" o
SET "voided_by_user_id" = a."user_id", "voided_by_name" = a."actor_name"
FROM (
  SELECT DISTINCT ON ("record_id") "record_id", "user_id", "actor_name"
  FROM "audit_logs"
  WHERE "module" = 'pos' AND "action" = 'void_order' AND "record_type" = 'pos_order' AND "user_id" IS NOT NULL
  ORDER BY "record_id", "created_at" DESC
) a
WHERE o."id"::text = a."record_id" AND o."status" = 'VOID' AND o."voided_by_user_id" IS NULL;

UPDATE "payments" p
SET "voided_by_user_id" = o."voided_by_user_id", "voided_by_name" = o."voided_by_name", "voided_at" = o."voided_at"
FROM "pos_orders" o
WHERE p."order_id" = o."id" AND p."status" = 'VOID' AND o."status" = 'VOID'
  AND o."voided_by_user_id" IS NOT NULL AND p."voided_by_user_id" IS NULL;

-- Back-fill: who collected older POS payments, from the audit entry written for that payment.
UPDATE "payments" p
SET "collected_by_user_id" = a."user_id", "collected_by_name" = a."actor_name"
FROM (
  SELECT DISTINCT ON ("record_id") "record_id", "user_id", "actor_name"
  FROM "audit_logs"
  WHERE "module" = 'pos' AND "action" = 'take_payment' AND "record_type" = 'payment' AND "user_id" IS NOT NULL
  ORDER BY "record_id", "created_at" ASC
) a
WHERE p."id"::text = a."record_id" AND p."collected_by_user_id" IS NULL;

-- Audit trail rows are append-only. The only changes still allowed are the automatic
-- foreign-key clean-ups run by the database itself (removing a whole organization, or clearing
-- a user/property reference); the staff name snapshot and every other column are kept.
CREATE OR REPLACE FUNCTION "hms_protect_audit_logs"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Audit trail records cannot be changed or deleted.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF (to_jsonb(NEW) - 'user_id' - 'property_id') = (to_jsonb(OLD) - 'user_id' - 'property_id') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Audit trail records cannot be changed or deleted.' USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS "audit_logs_protect_rows" ON "audit_logs";
CREATE TRIGGER "audit_logs_protect_rows"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "hms_protect_audit_logs"();

DROP TRIGGER IF EXISTS "audit_logs_protect_truncate" ON "audit_logs";
CREATE TRIGGER "audit_logs_protect_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "hms_protect_audit_logs"();

-- Every new audit entry keeps the staff name of the logged-in user, whichever module wrote it.
CREATE OR REPLACE FUNCTION "hms_audit_logs_actor_name"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."actor_name" IS NULL AND NEW."user_id" IS NOT NULL THEN
    SELECT u."full_name" INTO NEW."actor_name" FROM "users" u WHERE u."id" = NEW."user_id";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "audit_logs_actor_name" ON "audit_logs";
CREATE TRIGGER "audit_logs_actor_name"
BEFORE INSERT ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "hms_audit_logs_actor_name"();
