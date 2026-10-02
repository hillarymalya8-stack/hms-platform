"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, ClipboardCheck, Minus, PackagePlus, Plus, RefreshCcw, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
};

type StoreLocation = {
  id: string;
  name: string;
  type: string;
};

type StockLine = {
  itemId: string;
  locationId: string;
  quantity: number;
  averageCost: number;
  reorderLevel: number;
};

type Movement = {
  id: string;
  type: "RECEIPT" | "ISSUE" | "TRANSFER";
  reference: string;
  itemName: string;
  locationName: string;
  quantity: number;
  value: number;
  posting: string;
};

type InventoryWorkspaceResponse = {
  items: InventoryItem[];
  locations: StoreLocation[];
  stock: StockLine[];
  movements: Movement[];
};

export function InventoryWorkspace() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [stock, setStock] = useState<StockLine[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading saved inventory...");

  const [materialForm, setMaterialForm] = useState({
    sku: "",
    name: "",
    unitOfMeasure: "EA",
    reorderLevel: "0"
  });

  const [receiptForm, setReceiptForm] = useState({
    itemId: "",
    locationId: "",
    quantity: "",
    unitCost: "",
    supplierDoc: ""
  });

  const [issueForm, setIssueForm] = useState({
    itemId: "",
    sourceLocationId: "",
    quantity: "",
    destination: "Kitchen production",
    movementType: "ISSUE" as "ISSUE" | "TRANSFER",
    targetLocationId: ""
  });

  const stockRows = useMemo(
    () =>
      stock.map((line) => {
        const item = items.find((entry) => entry.id === line.itemId);
        const location = locations.find((entry) => entry.id === line.locationId);
        const value = line.quantity * line.averageCost;
        return { ...line, item, location, value, low: line.quantity <= line.reorderLevel };
      }),
    [items, locations, stock]
  );

  const inventoryValue = stockRows.reduce((sum, row) => sum + row.value, 0);
  const lowStockCount = stockRows.filter((row) => row.low).length;

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData(successMessage = "Inventory loaded with saved stock balances.") {
    setBusy(true);
    const result = await apiRequest<InventoryWorkspaceResponse>("/inventory");
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const nextItems = result.data.items;
    const nextLocations = result.data.locations;
    const defaultItemId = nextItems[0]?.id ?? "";
    const defaultLocationId = nextLocations[0]?.id ?? "";
    const targetLocationId = nextLocations.find((location) => location.id !== defaultLocationId)?.id ?? defaultLocationId;

    setItems(nextItems);
    setLocations(nextLocations);
    setStock(result.data.stock);
    setMovements(result.data.movements);
    setReceiptForm((current) => ({
      ...current,
      itemId: nextItems.some((item) => item.id === current.itemId) ? current.itemId : defaultItemId,
      locationId: nextLocations.some((location) => location.id === current.locationId) ? current.locationId : defaultLocationId
    }));
    setIssueForm((current) => ({
      ...current,
      itemId: nextItems.some((item) => item.id === current.itemId) ? current.itemId : defaultItemId,
      sourceLocationId: nextLocations.some((location) => location.id === current.sourceLocationId) ? current.sourceLocationId : defaultLocationId,
      targetLocationId: nextLocations.some((location) => location.id === current.targetLocationId) ? current.targetLocationId : targetLocationId
    }));
    setMessage(nextItems.length ? successMessage : "Inventory is ready. Add your first material, then receive stock for it.");
  }

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sku = materialForm.sku.trim().toUpperCase();
    const name = materialForm.name.trim();
    const unitOfMeasure = materialForm.unitOfMeasure.trim().toUpperCase();
    const reorderLevel = materialForm.reorderLevel.trim() || "0";

    if (!sku || !name || !unitOfMeasure) {
      setMessage("Enter SKU, material name, and unit before saving.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<InventoryItem>("/inventory/items", {
      method: "POST",
      body: JSON.stringify({ sku, name, unitOfMeasure, reorderLevel })
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setItems((current) => [...current, result.data].sort((left, right) => left.name.localeCompare(right.name)));
    setReceiptForm((current) => ({ ...current, itemId: result.data.id }));
    setIssueForm((current) => ({ ...current, itemId: result.data.id }));
    setMaterialForm({ sku: "", name: "", unitOfMeasure: "EA", reorderLevel: "0" });
    setMessage(`${result.data.name} has been added. You can now receive stock for it.`);
  }

  async function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(receiptForm.quantity);
    const unitCost = Number(receiptForm.unitCost);
    const item = items.find((entry) => entry.id === receiptForm.itemId);
    const location = locations.find((entry) => entry.id === receiptForm.locationId);

    if (!item || !location || quantity <= 0 || unitCost < 0) {
      setMessage("Choose a material, location, quantity, and valid cost before receiving stock.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<{ balance: StockLine; movement: Movement }>("/inventory/receipts", {
      method: "POST",
      body: JSON.stringify(receiptForm)
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    await loadData(`${item.name} received into ${location.name}. Inventory value increased by ${formatMoney(quantity * unitCost)}.`);
  }

  async function issueStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(issueForm.quantity);
    const item = items.find((entry) => entry.id === issueForm.itemId);
    const source = locations.find((entry) => entry.id === issueForm.sourceLocationId);
    const target = locations.find((entry) => entry.id === issueForm.targetLocationId);
    const sourceLine = stock.find((line) => line.itemId === issueForm.itemId && line.locationId === issueForm.sourceLocationId);

    if (!item || !source || quantity <= 0 || !sourceLine) {
      setMessage("Choose available stock and a valid quantity before posting movement.");
      return;
    }

    if (quantity > sourceLine.quantity) {
      setMessage(`Only ${sourceLine.quantity.toFixed(2)} ${item.unit} available in ${source.name}.`);
      return;
    }

    if (issueForm.movementType === "TRANSFER" && (!target || target.id === source.id)) {
      setMessage("Choose a different target store for the transfer.");
      return;
    }

    setBusy(true);
    const result = await apiRequest<{ movement: Movement }>("/inventory/movements", {
      method: "POST",
      body: JSON.stringify(issueForm)
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    const isTransfer = issueForm.movementType === "TRANSFER" && target;
    await loadData(
      isTransfer
        ? `${item.name} transferred from ${source.name} to ${target.name}.`
        : `${item.name} issued to ${issueForm.destination}. Inventory relieved by ${formatMoney(quantity * sourceLine.averageCost)}.`
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Inventory Control Workspace</h3>
            <p className="text-sm text-muted-foreground">Receive, issue, transfer, and monitor hotel stock balances.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">{message}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Stock value</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(inventoryValue)}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Tracked items</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{stockRows.length}</p>
          </div>
          <div className="rounded border border-border bg-white p-4">
            <p className="text-sm text-muted-foreground">Reorder alerts</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{lowStockCount}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Warehouse className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Stock Ledger</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg cost</th>
                  <th className="px-4 py-3 text-right font-semibold">Value</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                      No stock posted yet.
                    </td>
                  </tr>
                ) : (
                  stockRows.map((line) => (
                    <tr key={`${line.itemId}-${line.locationId}`} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{line.item?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.item?.sku} - {line.item?.category}
                        </p>
                      </td>
                      <td className="px-4 py-3">{line.location?.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {line.quantity.toFixed(2)} {line.item?.unit}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.averageCost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.value)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={line.low ? "warning" : "success"}>{line.low ? "Reorder" : "In stock"}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <form onSubmit={createMaterial} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Add New Material</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Material SKU"
              value={materialForm.sku}
              onChange={(event) => setMaterialForm({ ...materialForm, sku: event.target.value })}
              placeholder="SKU e.g. FOOD-010"
            />
            <Input
              aria-label="Material name"
              value={materialForm.name}
              onChange={(event) => setMaterialForm({ ...materialForm, name: event.target.value })}
              placeholder="Material name"
            />
            <Input
              aria-label="Unit of measure"
              value={materialForm.unitOfMeasure}
              onChange={(event) => setMaterialForm({ ...materialForm, unitOfMeasure: event.target.value })}
              placeholder="Unit e.g. KG, LTR, EA"
            />
            <Input
              aria-label="Reorder level"
              value={materialForm.reorderLevel}
              onChange={(event) => setMaterialForm({ ...materialForm, reorderLevel: event.target.value })}
              placeholder="Reorder level"
            />
          </div>
          <Button className="mt-3" disabled={busy}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Save material
          </Button>
        </form>

        <form onSubmit={receiveStock} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Receive Stock</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Receipt item"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={receiptForm.itemId}
              onChange={(event) => setReceiptForm({ ...receiptForm, itemId: event.target.value })}
            >
              <option value="">Select material</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Receipt location"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={receiptForm.locationId}
              onChange={(event) => setReceiptForm({ ...receiptForm, locationId: event.target.value })}
            >
              <option value="">Select store</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <Input
              aria-label="Receipt quantity"
              value={receiptForm.quantity}
              onChange={(event) => setReceiptForm({ ...receiptForm, quantity: event.target.value })}
              placeholder="Quantity"
            />
            <Input
              aria-label="Receipt unit cost"
              value={receiptForm.unitCost}
              onChange={(event) => setReceiptForm({ ...receiptForm, unitCost: event.target.value })}
              placeholder="Unit cost"
            />
            <Input
              aria-label="Supplier document"
              className="sm:col-span-2"
              value={receiptForm.supplierDoc}
              onChange={(event) => setReceiptForm({ ...receiptForm, supplierDoc: event.target.value })}
              placeholder="Supplier invoice or GRN"
            />
          </div>
          <Button className="mt-3" disabled={busy || items.length === 0 || locations.length === 0}>
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Post receipt
          </Button>
        </form>

        <form onSubmit={issueStock} className="rounded border border-border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Minus className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-bold">Issue or Transfer Stock</h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Movement item"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={issueForm.itemId}
              onChange={(event) => setIssueForm({ ...issueForm, itemId: event.target.value })}
            >
              <option value="">Select material</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Source location"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={issueForm.sourceLocationId}
              onChange={(event) => setIssueForm({ ...issueForm, sourceLocationId: event.target.value })}
            >
              <option value="">Select source store</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Movement type"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={issueForm.movementType}
              onChange={(event) => setIssueForm({ ...issueForm, movementType: event.target.value as "ISSUE" | "TRANSFER" })}
            >
              <option value="ISSUE">Issue to department</option>
              <option value="TRANSFER">Transfer store to store</option>
            </select>
            <Input
              aria-label="Movement quantity"
              value={issueForm.quantity}
              onChange={(event) => setIssueForm({ ...issueForm, quantity: event.target.value })}
              placeholder="Quantity"
            />
            {issueForm.movementType === "TRANSFER" ? (
              <select
                aria-label="Target location"
                className="h-10 rounded border border-border bg-white px-3 text-sm sm:col-span-2"
                value={issueForm.targetLocationId}
                onChange={(event) => setIssueForm({ ...issueForm, targetLocationId: event.target.value })}
              >
                <option value="">Select target store</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                aria-label="Issue destination"
                className="sm:col-span-2"
                value={issueForm.destination}
                onChange={(event) => setIssueForm({ ...issueForm, destination: event.target.value })}
                placeholder="Destination department"
              />
            )}
          </div>
          <Button className="mt-3" disabled={busy || stock.length === 0}>
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
            Post movement
          </Button>
        </form>

        <div className="rounded border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            <h4 className="font-bold">Movement Audit</h4>
          </div>
          <div className="divide-y divide-border">
            {movements.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No inventory movements posted yet.</div>
            ) : (
              movements.slice(0, 5).map((movement) => (
                <div key={movement.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{movement.reference}</p>
                      <p className="text-muted-foreground">
                        {movement.itemName} - {movement.locationName}
                      </p>
                    </div>
                    <Badge tone={movement.type === "RECEIPT" ? "success" : movement.type === "TRANSFER" ? "primary" : "warning"}>
                      {movement.type}
                    </Badge>
                  </div>
                  <p className="mt-2 tabular-nums">
                    {movement.quantity.toFixed(2)} units - {formatMoney(movement.value)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{movement.posting}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(value);
}
