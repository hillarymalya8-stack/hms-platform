-- Rooms and POS items carry a TSh price plus an optional USD price.
ALTER TABLE "room_types" ADD COLUMN "base_rate_usd" DECIMAL(18,4);
ALTER TABLE "outlet_products" ADD COLUMN "price_usd" DECIMAL(18,4);

-- Record the currency each stay and POS order was sold in.
ALTER TABLE "reservation_rooms" ADD COLUMN "currency_code" TEXT NOT NULL DEFAULT 'TZS';
ALTER TABLE "pos_orders" ADD COLUMN "currency_code" TEXT NOT NULL DEFAULT 'TZS';
