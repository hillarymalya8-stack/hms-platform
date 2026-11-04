-- Day expenses noted by reception, shown in Finance next to the day's room and POS sales.
-- New table only; no existing data changes.

-- CreateTable
CREATE TABLE "front_office_expenses" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "expense_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'TZS',
    "paid_by" TEXT,
    "recorded_by_user_id" UUID,
    "recorded_by_name" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" UUID,
    "voided_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "front_office_expenses_property_id_expense_date_idx" ON "front_office_expenses"("property_id", "expense_date");

-- AddForeignKey
ALTER TABLE "front_office_expenses" ADD CONSTRAINT "front_office_expenses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
