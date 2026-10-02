import { apiRequest } from "@/lib/api-client";

export type OfflineSaleStatus = "QUEUED" | "SYNCING" | "SYNCED" | "CONFLICT";
export type OfflinePaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "ROOM_CHARGE";
export type CachedPosOutletType = "RESTAURANT" | "BAR" | "ROOM_SERVICE" | "SPA" | "OTHER";

export type OfflineSaleLine = {
  productVariantId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
};

export type OfflineSale = {
  id: string;
  terminalId?: string;
  terminalName: string;
  outletId?: string;
  outletName: string;
  outletType?: CachedPosOutletType;
  folioId?: string;
  roomLabel?: string;
  localOrderNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: OfflinePaymentMethod;
  externalReference?: string;
  orderIdempotencyKey: string;
  paymentIdempotencyKey: string;
  status: OfflineSaleStatus;
  conflict?: string;
  receiptNumber?: string;
  createdAt: string;
  syncedAt?: string;
  syncAttempts: number;
  lines: OfflineSaleLine[];
};

export type CachedPosCatalog = {
  outlets: Array<{
    id: string;
    name: string;
    outletType: CachedPosOutletType;
    terminals: Array<{
      id: string;
      name: string;
      deviceIdentifier: string;
      syncStatus: string;
    }>;
  }>;
  selectedOutletId: string;
  selectedTerminalId: string;
  products: Array<{
    id: string;
    productVariantId: string;
    name: string;
    category: string;
    price: number;
    taxRate: number;
  }>;
  cachedAt: string;
};

type PosPayment = {
  id: string;
  systemReceiptNumber: string;
  paymentMethod: OfflinePaymentMethod;
  amount: string | number;
  createdAt: string;
};

type PosOrderResponse = {
  id: string;
  orderNumber: string;
  grandTotal: string | number;
  payments?: PosPayment[];
};

const offlineSalesKey = "hms_offline_pos_sales";
const cachedCatalogKey = "hms_offline_pos_catalog";
const queueChangedEvent = "hms-offline-pos-queue-changed";

export function readOfflineSales() {
  return readJson<OfflineSale[]>(offlineSalesKey, []);
}

export function saveOfflineSales(sales: OfflineSale[]) {
  writeJson(offlineSalesKey, sales);
  notifyQueueChanged();
}

export function enqueueOfflineSale(sale: Omit<OfflineSale, "id" | "status" | "createdAt" | "syncAttempts">) {
  const offlineSale: OfflineSale = {
    ...sale,
    id: createLocalId("offline-sale"),
    status: "QUEUED",
    createdAt: new Date().toISOString(),
    syncAttempts: 0
  };

  saveOfflineSales([offlineSale, ...readOfflineSales()]);
  return offlineSale;
}

export function updateOfflineSale(saleId: string, patch: Partial<OfflineSale>) {
  const updated = readOfflineSales().map((sale) => (sale.id === saleId ? { ...sale, ...patch } : sale));
  saveOfflineSales(updated);
  return updated.find((sale) => sale.id === saleId);
}

export async function syncQueuedOfflineSales() {
  const queue = readOfflineSales();
  let synced = 0;
  let conflicts = 0;

  for (const sale of queue) {
    if (sale.status !== "QUEUED") continue;

    updateOfflineSale(sale.id, {
      status: "SYNCING",
      conflict: undefined,
      syncAttempts: sale.syncAttempts + 1
    });

    const result = await syncOfflineSale(sale);
    if (result.ok) {
      synced += 1;
      updateOfflineSale(sale.id, result.sale);
    } else {
      conflicts += 1;
      updateOfflineSale(sale.id, {
        status: "CONFLICT",
        conflict: result.error
      });
    }
  }

  const remaining = readOfflineSales().filter((sale) => sale.status === "QUEUED" || sale.status === "CONFLICT").length;
  return { synced, conflicts, remaining };
}

export function saveCachedPosCatalog(catalog: CachedPosCatalog) {
  writeJson(cachedCatalogKey, catalog);
}

export function readCachedPosCatalog() {
  return readJson<CachedPosCatalog | null>(cachedCatalogKey, null);
}

export function onOfflineQueueChanged(listener: () => void) {
  window.addEventListener(queueChangedEvent, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(queueChangedEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

async function syncOfflineSale(sale: OfflineSale): Promise<{ ok: true; sale: Partial<OfflineSale> } | { ok: false; error: string }> {
  if (!sale.outletId) {
    return { ok: false, error: "The offline sale is missing its outlet. Sync the POS catalog before selling offline." };
  }

  const orderResult = await apiRequest<PosOrderResponse>("/pos/orders", {
    method: "POST",
    body: JSON.stringify({
      outletId: sale.outletId,
      terminalId: sale.terminalId,
      folioId: sale.folioId,
      serviceType: serviceTypeForOutletType(sale.outletType),
      idempotencyKey: sale.orderIdempotencyKey,
      items: sale.lines.map((line) => ({
        productVariantId: line.productVariantId,
        quantity: String(line.quantity)
      }))
    })
  });

  if (!orderResult.ok) {
    return { ok: false, error: orderResult.error };
  }

  const paymentResult = await apiRequest<PosOrderResponse>(`/pos/orders/${orderResult.data.id}/payments`, {
    method: "POST",
    body: JSON.stringify({
      paymentMethod: sale.paymentMethod,
      amount: String(orderResult.data.grandTotal),
      externalReceiptNumber: sale.externalReference || undefined,
      externalReference: sale.externalReference || undefined,
      idempotencyKey: sale.paymentIdempotencyKey
    })
  });

  if (!paymentResult.ok) {
    return { ok: false, error: paymentResult.error };
  }

  const payments = paymentResult.data.payments ?? [];
  const payment = payments[payments.length - 1];

  return {
    ok: true,
    sale: {
      status: "SYNCED",
      receiptNumber: payment?.systemReceiptNumber ?? orderResult.data.orderNumber,
      syncedAt: new Date().toISOString(),
      conflict: undefined
    }
  };
}

function serviceTypeForOutletType(outletType?: CachedPosOutletType) {
  return outletType === "BAR" ? "BAR" : "TAKEAWAY";
}

function notifyQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(queueChangedEvent));
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
