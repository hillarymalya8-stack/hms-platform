-- CreateTable
CREATE TABLE "daily_usage_records" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "purpose" TEXT,
    "notes" TEXT,
    "recorded_by_user_id" UUID,
    "recorded_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_usage_records_property_id_business_date_idx" ON "daily_usage_records"("property_id", "business_date");

-- CreateIndex
CREATE INDEX "daily_usage_records_location_id_business_date_idx" ON "daily_usage_records"("location_id", "business_date");

-- AddForeignKey
ALTER TABLE "daily_usage_records" ADD CONSTRAINT "daily_usage_records_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_usage_records" ADD CONSTRAINT "daily_usage_records_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_usage_records" ADD CONSTRAINT "daily_usage_records_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
