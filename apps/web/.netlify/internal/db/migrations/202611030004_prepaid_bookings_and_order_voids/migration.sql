-- Prepaid bookings: board plan and paying company recorded at check-in (amount goes to deposit_paid).
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "meal_plan" TEXT;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "company_name" TEXT;

-- Restaurant/bar order voids.
ALTER TABLE "pos_orders" ADD COLUMN IF NOT EXISTS "void_reason" TEXT;
ALTER TABLE "pos_orders" ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3);
