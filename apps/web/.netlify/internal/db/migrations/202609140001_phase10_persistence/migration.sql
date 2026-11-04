-- CreateEnum
CREATE TYPE "PosOutletType" AS ENUM ('RESTAURANT', 'BAR', 'ROOM_SERVICE', 'SPA', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STOCKED', 'NON_STOCKED', 'SERVICE');

-- CreateEnum
CREATE TYPE "DiningTableStatus" AS ENUM ('AVAILABLE', 'SEATED', 'ORDER_OPEN', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "CashierShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "PosOrderStatus" AS ENUM ('OPEN', 'HELD', 'PAID', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PosServiceType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE', 'BAR');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'CREDIT', 'MOBILE_MONEY', 'BANK_TRANSFER', 'ROOM_CHARGE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'COUNT_VARIANCE');

-- CreateEnum
CREATE TYPE "InventoryMovementStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'MATCHED', 'POSTED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "OfflineTerminalStatus" AS ENUM ('ONLINE', 'OFFLINE', 'SYNCING');

-- CreateEnum
CREATE TYPE "OfflineSyncEventStatus" AS ENUM ('QUEUED', 'SYNCED', 'CONFLICT', 'FAILED');

-- CreateTable
CREATE TABLE "pos_outlets" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "outlet_type" "PosOutletType" NOT NULL DEFAULT 'RESTAURANT',
    "default_revenue_account_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_terminals" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "device_identifier" TEXT NOT NULL,
    "sync_status" TEXT NOT NULL DEFAULT 'ONLINE',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawers" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "terminal_id" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_drawers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_shifts" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "drawer_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "opening_cash" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expected_cash" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "actual_cash" DECIMAL(18,4),
    "variance" DECIMAL(18,4),
    "status" "CashierShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "revenue_account_id" UUID,
    "cost_account_id" UUID,
    "inventory_account_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'NON_STOCKED',
    "stock_tracked" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "base_price" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_products" (
    "outlet_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "tax_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "outlet_products_pkey" PRIMARY KEY ("outlet_id","product_variant_id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "table_number" TEXT NOT NULL,
    "section" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 2,
    "status" "DiningTableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_orders" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "terminal_id" UUID,
    "shift_id" UUID,
    "table_id" UUID,
    "folio_id" UUID,
    "order_number" TEXT NOT NULL,
    "status" "PosOrderStatus" NOT NULL DEFAULT 'OPEN',
    "service_type" "PosServiceType" NOT NULL DEFAULT 'DINE_IN',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "service_charge_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tip_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "order_id" UUID,
    "shift_id" UUID,
    "source_type" TEXT NOT NULL DEFAULT 'POS_ORDER',
    "source_id" UUID NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "system_receipt_number" TEXT NOT NULL,
    "external_receipt_number" TEXT,
    "authorization_code" TEXT,
    "external_reference" TEXT,
    "idempotency_key" TEXT,
    "payment_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_of_measure" TEXT NOT NULL DEFAULT 'EA',
    "reorder_level" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_type" TEXT NOT NULL DEFAULT 'STORE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "journal_entry_id" UUID,
    "movement_type" "InventoryMovementType" NOT NULL,
    "status" "InventoryMovementStatus" NOT NULL DEFAULT 'DRAFT',
    "source_type" TEXT,
    "source_id" UUID,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "business_date" DATE NOT NULL,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "tax_number" TEXT,
    "payment_terms" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_at" DATE,
    "approved_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "inventory_item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity_ordered" DECIMAL(18,4) NOT NULL,
    "quantity_received" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "tax_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "journal_entry_id" UUID,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paid_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "requested_by_id" UUID,
    "report_name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "ReportExportStatus" NOT NULL DEFAULT 'QUEUED',
    "date_from" DATE,
    "date_to" DATE,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "file_url" TEXT,
    "error_message" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_terminals" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "outlet_id" UUID,
    "terminal_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OfflineTerminalStatus" NOT NULL DEFAULT 'ONLINE',
    "last_seen_at" TIMESTAMP(3),
    "device_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_sync_events" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "local_reference" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "OfflineSyncEventStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "conflict_reason" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persistence_transitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID,
    "user_id" UUID,
    "module_id" TEXT NOT NULL,
    "module_name" TEXT NOT NULL,
    "previous_stage" TEXT NOT NULL,
    "target_stage" TEXT NOT NULL,
    "note" TEXT,
    "required_checks" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persistence_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_outlets_property_id_outlet_type_active_idx" ON "pos_outlets"("property_id", "outlet_type", "active");
CREATE UNIQUE INDEX "pos_outlets_property_id_name_key" ON "pos_outlets"("property_id", "name");
CREATE INDEX "pos_terminals_outlet_id_sync_status_idx" ON "pos_terminals"("outlet_id", "sync_status");
CREATE UNIQUE INDEX "pos_terminals_outlet_id_device_identifier_key" ON "pos_terminals"("outlet_id", "device_identifier");
CREATE INDEX "cash_drawers_terminal_id_idx" ON "cash_drawers"("terminal_id");
CREATE UNIQUE INDEX "cash_drawers_outlet_id_name_key" ON "cash_drawers"("outlet_id", "name");
CREATE INDEX "cashier_shifts_outlet_id_status_idx" ON "cashier_shifts"("outlet_id", "status");
CREATE INDEX "cashier_shifts_cashier_id_status_idx" ON "cashier_shifts"("cashier_id", "status");
CREATE INDEX "product_categories_property_id_active_idx" ON "product_categories"("property_id", "active");
CREATE UNIQUE INDEX "product_categories_property_id_name_key" ON "product_categories"("property_id", "name");
CREATE INDEX "products_property_id_active_idx" ON "products"("property_id", "active");
CREATE UNIQUE INDEX "products_property_id_sku_key" ON "products"("property_id", "sku");
CREATE INDEX "product_variants_product_id_active_idx" ON "product_variants"("product_id", "active");
CREATE UNIQUE INDEX "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");
CREATE INDEX "outlet_products_product_variant_id_available_idx" ON "outlet_products"("product_variant_id", "available");
CREATE INDEX "dining_tables_outlet_id_status_idx" ON "dining_tables"("outlet_id", "status");
CREATE UNIQUE INDEX "dining_tables_outlet_id_table_number_key" ON "dining_tables"("outlet_id", "table_number");
CREATE INDEX "pos_orders_property_id_outlet_id_status_idx" ON "pos_orders"("property_id", "outlet_id", "status");
CREATE INDEX "pos_orders_table_id_status_idx" ON "pos_orders"("table_id", "status");
CREATE UNIQUE INDEX "pos_orders_property_id_order_number_key" ON "pos_orders"("property_id", "order_number");
CREATE UNIQUE INDEX "pos_orders_property_id_idempotency_key_key" ON "pos_orders"("property_id", "idempotency_key");
CREATE INDEX "pos_order_items_order_id_idx" ON "pos_order_items"("order_id");
CREATE INDEX "pos_order_items_product_variant_id_idx" ON "pos_order_items"("product_variant_id");
CREATE UNIQUE INDEX "payments_property_id_system_receipt_number_key" ON "payments"("property_id", "system_receipt_number");
CREATE UNIQUE INDEX "payments_property_id_idempotency_key_key" ON "payments"("property_id", "idempotency_key");
CREATE INDEX "payments_property_id_source_type_source_id_idx" ON "payments"("property_id", "source_type", "source_id");
CREATE INDEX "payments_property_id_payment_method_external_receipt_number_idx" ON "payments"("property_id", "payment_method", "external_receipt_number");
CREATE INDEX "inventory_items_property_id_active_idx" ON "inventory_items"("property_id", "active");
CREATE UNIQUE INDEX "inventory_items_property_id_sku_key" ON "inventory_items"("property_id", "sku");
CREATE INDEX "inventory_locations_property_id_active_idx" ON "inventory_locations"("property_id", "active");
CREATE UNIQUE INDEX "inventory_locations_property_id_code_key" ON "inventory_locations"("property_id", "code");
CREATE INDEX "inventory_balances_location_id_idx" ON "inventory_balances"("location_id");
CREATE UNIQUE INDEX "inventory_balances_item_id_location_id_key" ON "inventory_balances"("item_id", "location_id");
CREATE INDEX "inventory_movements_property_id_business_date_status_idx" ON "inventory_movements"("property_id", "business_date", "status");
CREATE INDEX "inventory_movements_item_id_business_date_idx" ON "inventory_movements"("item_id", "business_date");
CREATE INDEX "inventory_movements_source_type_source_id_idx" ON "inventory_movements"("source_type", "source_id");
CREATE INDEX "suppliers_property_id_status_idx" ON "suppliers"("property_id", "status");
CREATE UNIQUE INDEX "suppliers_property_id_supplier_code_key" ON "suppliers"("property_id", "supplier_code");
CREATE INDEX "purchase_orders_property_id_supplier_id_status_idx" ON "purchase_orders"("property_id", "supplier_id", "status");
CREATE UNIQUE INDEX "purchase_orders_property_id_order_number_key" ON "purchase_orders"("property_id", "order_number");
CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "purchase_order_lines"("purchase_order_id");
CREATE INDEX "purchase_order_lines_inventory_item_id_idx" ON "purchase_order_lines"("inventory_item_id");
CREATE UNIQUE INDEX "supplier_invoices_property_id_supplier_id_invoice_number_key" ON "supplier_invoices"("property_id", "supplier_id", "invoice_number");
CREATE INDEX "supplier_invoices_property_id_status_invoice_date_idx" ON "supplier_invoices"("property_id", "status", "invoice_date");
CREATE INDEX "supplier_invoices_purchase_order_id_idx" ON "supplier_invoices"("purchase_order_id");
CREATE INDEX "report_exports_property_id_status_queued_at_idx" ON "report_exports"("property_id", "status", "queued_at");
CREATE INDEX "report_exports_requested_by_id_queued_at_idx" ON "report_exports"("requested_by_id", "queued_at");
CREATE INDEX "offline_terminals_property_id_status_idx" ON "offline_terminals"("property_id", "status");
CREATE UNIQUE INDEX "offline_terminals_property_id_terminal_code_key" ON "offline_terminals"("property_id", "terminal_code");
CREATE UNIQUE INDEX "offline_sync_events_property_id_idempotency_key_key" ON "offline_sync_events"("property_id", "idempotency_key");
CREATE INDEX "offline_sync_events_property_id_status_created_at_idx" ON "offline_sync_events"("property_id", "status", "created_at");
CREATE INDEX "offline_sync_events_terminal_id_status_idx" ON "offline_sync_events"("terminal_id", "status");
CREATE INDEX "persistence_transitions_property_id_module_id_created_at_idx" ON "persistence_transitions"("property_id", "module_id", "created_at");
CREATE INDEX "persistence_transitions_user_id_created_at_idx" ON "persistence_transitions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "pos_outlets" ADD CONSTRAINT "pos_outlets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_outlets" ADD CONSTRAINT "pos_outlets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_drawer_id_fkey" FOREIGN KEY ("drawer_id") REFERENCES "cash_drawers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outlet_products" ADD CONSTRAINT "outlet_products_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outlet_products" ADD CONSTRAINT "outlet_products_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pos_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pos_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_terminals" ADD CONSTRAINT "offline_terminals_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "offline_terminals" ADD CONSTRAINT "offline_terminals_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_sync_events" ADD CONSTRAINT "offline_sync_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_sync_events" ADD CONSTRAINT "offline_sync_events_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "offline_terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "persistence_transitions" ADD CONSTRAINT "persistence_transitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "persistence_transitions" ADD CONSTRAINT "persistence_transitions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "persistence_transitions" ADD CONSTRAINT "persistence_transitions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
