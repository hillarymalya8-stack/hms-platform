"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Armchair, Check, Pencil, Plus, RefreshCcw, Search, Tags, UtensilsCrossed, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

type OutletType = "RESTAURANT" | "BAR" | "ROOM_SERVICE" | "SPA" | "OTHER";

type MenuOutlet = { id: string; name: string; outletType: OutletType };

type MenuCategory = { id: string; name: string; parentId: string | null; active: boolean; productCount: number };

type OutletPrice = {
  outletId: string;
  outletName: string;
  outletType: OutletType;
  price: string;
  priceUsd: string | null;
  taxRate: string;
  available: boolean;
};

type MenuProduct = {
  id: string;
  name: string;
  sku: string;
  active: boolean;
  stockTracked: boolean;
  category: { id: string; name: string };
  variants: Array<{ id: string; name: string; sku: string; active: boolean; basePrice: string; outlets: OutletPrice[] }>;
};

type MenuResponse = { outlets: MenuOutlet[]; categories: MenuCategory[]; products: MenuProduct[] };

type DiningTable = { id: string; tableNumber: string; section: string | null; seats: number; status: string };

type ProductDraft = {
  name: string;
  sku: string;
  categoryId: string;
  price: string;
  priceUsd: string;
  taxPercent: string;
  outletIds: string[];
};

type EditDraft = {
  productId: string;
  name: string;
  categoryId: string;
  price: string;
  priceUsd: string;
  taxPercent: string;
  outletIds: string[];
};

const emptyDraft: ProductDraft = { name: "", sku: "", categoryId: "", price: "", priceUsd: "", taxPercent: "0", outletIds: [] };

export function MenuManagementPanel({ canManageTables = false }: { canManageTables?: boolean }) {
  const [menu, setMenu] = useState<MenuResponse>({ outlets: [], categories: [], products: [] });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading menu...");
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [skuTouched, setSkuTouched] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [tableOutletId, setTableOutletId] = useState("");
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tableForm, setTableForm] = useState({ tableNumbers: "", section: "", seats: "4" });

  const tableOutlets = menu.outlets;

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menu.products.filter(
      (product) =>
        (showRetired || product.active) &&
        (!filterCategoryId || product.category.id === filterCategoryId) &&
        (!term || product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term))
    );
  }, [menu.products, search, filterCategoryId, showRetired]);

  useEffect(() => {
    void loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canManageTables && tableOutletId) void loadTables(tableOutletId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableOutletId, canManageTables]);

  function report(text: string, isError = false) {
    setMessage(text);
    setError(isError);
  }

  async function loadMenu() {
    setBusy(true);
    const result = await apiRequest<MenuResponse>("/pos/menu");
    setBusy(false);
    setLoaded(true);

    if (!result.ok) {
      report(result.error, true);
      return;
    }

    setMenu(result.data);
    setDraft((current) => ({
      ...current,
      categoryId: current.categoryId || result.data.categories.find((category) => category.active)?.id || "",
      outletIds: current.outletIds.length ? current.outletIds : result.data.outlets.map((outlet) => outlet.id)
    }));
    setTableOutletId((current) => current || result.data.outlets.find((outlet) => outlet.outletType !== "BAR")?.id || result.data.outlets[0]?.id || "");
    report(
      result.data.products.length
        ? `${result.data.products.length} product${result.data.products.length === 1 ? "" : "s"} on the menu.`
        : "No products yet. Add the first menu item below."
    );
  }

  async function loadTables(outletId: string) {
    const result = await apiRequest<DiningTable[]>(`/pos/outlets/${outletId}/tables`);
    if (result.ok) setTables(result.data);
    else {
      setTables([]);
      report(result.error, true);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;

    setBusy(true);
    const result = await apiRequest<MenuCategory>("/pos/categories", { method: "POST", body: JSON.stringify({ name }) });
    setBusy(false);

    if (!result.ok) {
      report(result.error, true);
      return;
    }

    setCategoryName("");
    setMenu((current) => ({
      ...current,
      categories: [...current.categories, { ...result.data, productCount: 0 }].sort((a, b) => a.name.localeCompare(b.name))
    }));
    setDraft((current) => ({ ...current, categoryId: result.data.id }));
    report(`Category ${result.data.name} added.`);
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const taxRate = percentToFraction(draft.taxPercent);
    const price = normalizeAmount(draft.price);
    const priceUsd = normalizeOptionalAmount(draft.priceUsd);

    if (!draft.name.trim() || !draft.sku.trim() || !draft.categoryId) {
      report("Enter a name, SKU, and category.", true);
      return;
    }
    if (price === null) {
      report("Enter a valid TSh price, for example 5000.", true);
      return;
    }
    if (priceUsd === null) {
      report("Enter a valid USD price, for example 2.50, or leave it empty.", true);
      return;
    }
    if (taxRate === null) {
      report("Enter a tax rate between 0 and 100 percent.", true);
      return;
    }
    if (draft.outletIds.length === 0) {
      report("Choose at least one outlet that sells this product.", true);
      return;
    }

    setBusy(true);
    const result = await apiRequest<MenuProduct>("/pos/products", {
      method: "POST",
      body: JSON.stringify({
        name: draft.name.trim(),
        sku: draft.sku.trim(),
        categoryId: draft.categoryId,
        price,
        priceUsd: priceUsd || undefined,
        taxRate,
        outletIds: draft.outletIds
      })
    });
    setBusy(false);

    if (!result.ok) {
      report(result.error, true);
      return;
    }

    upsertProduct(result.data);
    setDraft((current) => ({ ...emptyDraft, categoryId: current.categoryId, taxPercent: current.taxPercent, outletIds: current.outletIds }));
    setSkuTouched(false);
    report(`${result.data.name} added at ${result.data.variants[0]?.outlets.map((entry) => entry.outletName).join(" and ") || "no outlets"}.`);
  }

  async function patchProduct(product: MenuProduct, body: Record<string, unknown>, success: string) {
    setBusy(true);
    const result = await apiRequest<MenuProduct>(`/pos/products/${product.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusy(false);

    if (!result.ok) {
      report(result.error, true);
      return false;
    }

    upsertProduct(result.data);
    report(success);
    return true;
  }

  async function saveEdit(product: MenuProduct) {
    if (!edit) return;
    const price = normalizeAmount(edit.price);
    const priceUsd = normalizeOptionalAmount(edit.priceUsd);
    const taxRate = percentToFraction(edit.taxPercent);
    if (!edit.name.trim() || price === null || priceUsd === null || taxRate === null) {
      report("Enter a name, a valid TSh price, an optional USD price, and a tax rate between 0 and 100.", true);
      return;
    }

    const saved = await patchProduct(
      product,
      { name: edit.name.trim(), categoryId: edit.categoryId, price, priceUsd, taxRate, outletIds: edit.outletIds },
      `${edit.name.trim()} updated.`
    );
    if (saved) setEdit(null);
  }

  function startEdit(product: MenuProduct) {
    const outlets = product.variants[0]?.outlets ?? [];
    setEdit({
      productId: product.id,
      name: product.name,
      categoryId: product.category.id,
      price: outlets[0]?.price ?? product.variants[0]?.basePrice ?? "0.00",
      priceUsd: outlets[0]?.priceUsd ?? "",
      taxPercent: fractionToPercent(outlets[0]?.taxRate ?? "0"),
      outletIds: outlets.map((entry) => entry.outletId)
    });
  }

  function upsertProduct(product: MenuProduct) {
    setMenu((current) => {
      const exists = current.products.some((entry) => entry.id === product.id);
      const products = exists
        ? current.products.map((entry) => (entry.id === product.id ? product : entry))
        : [...current.products, product].sort((a, b) => a.name.localeCompare(b.name));
      const counts = new Map<string, number>();
      for (const entry of products) counts.set(entry.category.id, (counts.get(entry.category.id) ?? 0) + 1);
      return {
        ...current,
        products,
        categories: current.categories.map((category) => ({ ...category, productCount: counts.get(category.id) ?? 0 }))
      };
    });
  }

  async function createTables(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numbers = parseTableNumbers(tableForm.tableNumbers);
    const seats = Number(tableForm.seats);
    if (!tableOutletId || numbers.length === 0) {
      report("Choose an outlet and enter table numbers, for example 1-12 or T1, T2.", true);
      return;
    }
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      report("Seats must be a whole number between 1 and 50.", true);
      return;
    }
    if (numbers.length > 100) {
      report("Add 100 tables or fewer at a time.", true);
      return;
    }

    const existing = new Set(tables.map((table) => table.tableNumber.toLowerCase()));
    const toCreate = numbers.filter((number) => !existing.has(number.toLowerCase()));
    if (toCreate.length === 0) {
      report("Those tables already exist.", true);
      return;
    }

    setBusy(true);
    let created = 0;
    let failure = "";
    for (const tableNumber of toCreate) {
      const result = await apiRequest<DiningTable>(`/pos/outlets/${tableOutletId}/tables`, {
        method: "POST",
        body: JSON.stringify({ tableNumber, section: tableForm.section.trim() || undefined, seats })
      });
      if (!result.ok) {
        failure = `Table ${tableNumber}: ${result.error}`;
        break;
      }
      created += 1;
    }
    setBusy(false);

    await loadTables(tableOutletId);
    if (!failure) setTableForm((current) => ({ ...current, tableNumbers: "" }));
    report(
      [`${created} table${created === 1 ? "" : "s"} added.`, failure ? `Stopped at ${failure}` : ""].filter(Boolean).join(" "),
      Boolean(failure)
    );
  }

  const outletName = (outletId: string) => menu.outlets.find((outlet) => outlet.id === outletId)?.name ?? "Outlet";

  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="font-bold">Menu &amp; prices</h4>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{menu.products.filter((product) => product.active).length} items</Badge>
          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => void loadMenu()} disabled={busy}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Reload
          </Button>
        </div>
      </div>

      <p
        className={`mb-4 rounded border px-3 py-2 text-sm ${error ? "border-danger/40 bg-danger/5 text-danger" : "border-border bg-background/70 text-muted-foreground"}`}
        aria-live="polite"
      >
        {message}
      </p>

      {loaded && menu.outlets.length === 0 ? (
        <p className="mb-4 rounded border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          No POS outlets are available to you. Outlet access (Bar / Restaurant) is granted per user in staff accounts.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <form onSubmit={createProduct} className="rounded border border-border bg-background p-3">
          <p className="mb-3 text-sm font-bold">Add menu item</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="Product name"
              value={draft.name}
              onChange={(event) => {
                const name = event.target.value;
                setDraft((current) => ({ ...current, name, sku: skuTouched ? current.sku : suggestSku(name) }));
              }}
              placeholder="Name, e.g. Club Sandwich"
            />
            <Input
              aria-label="SKU"
              value={draft.sku}
              onChange={(event) => {
                setSkuTouched(true);
                setDraft({ ...draft, sku: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, "") });
              }}
              placeholder="SKU"
            />
            <select
              aria-label="Category"
              className="h-10 rounded border border-border bg-white px-3 text-sm"
              value={draft.categoryId}
              onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
            >
              <option value="">Select category</option>
              {menu.categories
                .filter((category) => category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Price (TSh)
                <Input
                  aria-label="Price in TSh"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                  placeholder="e.g. 5000"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Price (USD)
                <Input
                  aria-label="Price in USD"
                  inputMode="decimal"
                  value={draft.priceUsd}
                  onChange={(event) => setDraft({ ...draft, priceUsd: event.target.value })}
                  placeholder="e.g. 2.00"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Tax %
                <Input
                  aria-label="Tax rate percent"
                  inputMode="decimal"
                  value={draft.taxPercent}
                  onChange={(event) => setDraft({ ...draft, taxPercent: event.target.value })}
                  placeholder="Tax %"
                />
              </label>
            </div>
          </div>
          <OutletPicker
            outlets={menu.outlets}
            selected={draft.outletIds}
            onChange={(outletIds) => setDraft({ ...draft, outletIds })}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Prices exclude tax; tax is added at the till. The POS uses the TSh or USD price depending on the currency the cashier sells in; leave USD empty for TSh-only items. Bar sales deduct Bar Store stock when the SKU matches an inventory item.
          </p>
          <Button className="mt-3" disabled={busy || menu.outlets.length === 0}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add item
          </Button>
        </form>

        <div className="rounded border border-border bg-background p-3">
          <div className="mb-3 flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-bold">Categories</p>
          </div>
          <form onSubmit={createCategory} className="flex gap-2">
            <Input aria-label="New category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="New category" />
            <Button className="px-3" disabled={busy || !categoryName.trim()} aria-label="Add category">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
          <div className="mt-3 space-y-1">
            {menu.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            ) : (
              menu.categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between rounded bg-white px-2 py-1.5 text-sm">
                  <span className={category.active ? "" : "text-muted-foreground line-through"}>{category.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{category.productCount}</span>
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Drink, bar and beverage categories print to the Bar Printer; everything else goes to the kitchen.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search menu" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" />
        </div>
        <select
          aria-label="Filter by category"
          className="h-10 rounded border border-border bg-white px-3 text-sm"
          value={filterCategoryId}
          onChange={(event) => setFilterCategoryId(event.target.value)}
        >
          <option value="">All categories</option>
          {menu.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showRetired} onChange={(event) => setShowRetired(event.target.checked)} />
          Show retired
        </label>
      </div>

      <div className="mt-3 overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Sold at</th>
              <th className="px-3 py-2 text-right font-semibold">Price (TSh)</th>
              <th className="px-3 py-2 text-right font-semibold">Price (USD)</th>
              <th className="px-3 py-2 text-right font-semibold">Tax</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {menu.products.length === 0 ? "The menu is empty. Add your first item above." : "No items match this filter."}
                </td>
              </tr>
            ) : (
              visibleProducts.map((product) => {
                const outlets = product.variants[0]?.outlets ?? [];
                const prices = Array.from(new Set(outlets.map((entry) => entry.price)));
                const usdPrices = Array.from(new Set(outlets.map((entry) => entry.priceUsd).filter((value): value is string => Boolean(value))));
                const taxes = Array.from(new Set(outlets.map((entry) => entry.taxRate)));
                const available = outlets.length > 0 && outlets.every((entry) => entry.available);
                const editing = edit?.productId === product.id ? edit : null;

                if (editing) {
                  return (
                    <tr key={product.id} className="bg-background">
                      <td className="px-3 py-2">
                        <Input aria-label="Edit name" value={editing.name} onChange={(event) => setEdit({ ...editing, name: event.target.value })} />
                        <p className="mt-1 text-xs text-muted-foreground">{product.sku}</p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label="Edit category"
                          className="h-10 w-full rounded border border-border bg-white px-2 text-sm"
                          value={editing.categoryId}
                          onChange={(event) => setEdit({ ...editing, categoryId: event.target.value })}
                        >
                          {menu.categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <OutletPicker compact outlets={menu.outlets} selected={editing.outletIds} onChange={(outletIds) => setEdit({ ...editing, outletIds })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label="Edit TSh price" inputMode="decimal" className="text-right" value={editing.price} onChange={(event) => setEdit({ ...editing, price: event.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label="Edit USD price" inputMode="decimal" className="text-right" value={editing.priceUsd} placeholder="None" onChange={(event) => setEdit({ ...editing, priceUsd: event.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label="Edit tax percent" inputMode="decimal" className="text-right" value={editing.taxPercent} onChange={(event) => setEdit({ ...editing, taxPercent: event.target.value })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" className="h-8 px-2" onClick={() => void saveEdit(product)} disabled={busy} aria-label="Save changes">
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => setEdit(null)} aria-label="Cancel editing">
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={product.id} className={product.active ? "" : "bg-muted/30 text-muted-foreground"}>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </td>
                    <td className="px-3 py-2">{product.category.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {outlets.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Not on any menu</span>
                        ) : (
                          outlets.map((entry) => (
                            <Badge key={entry.outletId} tone={entry.available ? "success" : "neutral"} className="h-6">
                              {entry.outletName}
                              {entry.available ? "" : " (off)"}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {prices.length === 0 ? formatAmount(product.variants[0]?.basePrice ?? "0") : prices.map(formatAmount).join(" / ")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{usdPrices.length ? usdPrices.map(formatAmount).join(" / ") : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{taxes.length ? taxes.map((rate) => `${fractionToPercent(rate)}%`).join(" / ") : "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {product.active ? (
                          <>
                            <Button type="button" variant="secondary" className="h-8 px-2" onClick={() => startEdit(product)} aria-label={`Edit ${product.name}`}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-8 px-2 text-xs"
                              disabled={busy || outlets.length === 0}
                              onClick={() =>
                                void patchProduct(
                                  product,
                                  { available: !available },
                                  `${product.name} is now ${available ? "unavailable (86'd)" : "available"}.`
                                )
                              }
                            >
                              {available ? "Mark sold out" : "Mark available"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Retire ${product.name}? It will be removed from every POS menu. Sales history is kept.`)) {
                                  void patchProduct(product, { active: false }, `${product.name} retired from all menus.`);
                                }
                              }}
                            >
                              Retire
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-8 px-2 text-xs"
                            disabled={busy}
                            onClick={() => void patchProduct(product, { active: true, available: true }, `${product.name} restored.`)}
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canManageTables ? (
        <div className="mt-4 rounded border border-border bg-background p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Armchair className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-bold">Dining tables</p>
            </div>
            <select
              aria-label="Outlet for tables"
              className="h-9 rounded border border-border bg-white px-3 text-sm"
              value={tableOutletId}
              onChange={(event) => setTableOutletId(event.target.value)}
            >
              {tableOutlets.length === 0 ? <option value="">No outlets</option> : null}
              {tableOutlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </div>
          <form onSubmit={createTables} className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
            <Input
              aria-label="Table numbers"
              value={tableForm.tableNumbers}
              onChange={(event) => setTableForm({ ...tableForm, tableNumbers: event.target.value })}
              placeholder="Table numbers: 1-12, T1"
            />
            <Input
              aria-label="Section"
              value={tableForm.section}
              onChange={(event) => setTableForm({ ...tableForm, section: event.target.value })}
              placeholder="Section (optional)"
            />
            <Input aria-label="Seats" inputMode="numeric" value={tableForm.seats} onChange={(event) => setTableForm({ ...tableForm, seats: event.target.value })} placeholder="Seats" />
            <Button disabled={busy || !tableOutletId}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tableOutletId ? `No tables at ${outletName(tableOutletId)} yet.` : "Choose an outlet."}</p>
            ) : (
              tables.map((table) => (
                <span key={table.id} className="rounded border border-border bg-white px-2 py-1 text-xs">
                  <span className="font-semibold">{table.tableNumber}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {table.seats} seats{table.section ? ` · ${table.section}` : ""}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutletPicker({
  outlets,
  selected,
  onChange,
  compact = false
}: {
  outlets: MenuOutlet[];
  selected: string[];
  onChange: (outletIds: string[]) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className={compact ? "flex flex-col gap-1" : "mt-3 flex flex-wrap gap-3"}>
      {compact ? null : <legend className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Sell at</legend>}
      {outlets.map((outlet) => (
        <label key={outlet.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(outlet.id)}
            onChange={(event) =>
              onChange(event.target.checked ? [...selected, outlet.id] : selected.filter((outletId) => outletId !== outlet.id))
            }
          />
          {outlet.name}
        </label>
      ))}
    </fieldset>
  );
}

function suggestSku(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(trimmed)) return null;
  return trimmed;
}

// Empty means "no USD price"; returns null only when the value is present but invalid.
function normalizeOptionalAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeAmount(trimmed);
}

// The API stores tax as a fraction (0.16); staff enter a percentage (16).
function percentToFraction(value: string) {
  const trimmed = value.trim() || "0";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const percent = Number(trimmed);
  if (percent < 0 || percent > 100) return null;
  return (Math.round(percent * 100) / 10000).toFixed(4);
}

function fractionToPercent(value: string) {
  const percent = Math.round(Number(value) * 10000) / 100;
  return Number.isFinite(percent) ? String(percent) : "0";
}

function formatAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : value;
}

function parseTableNumbers(value: string) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of value.split(/[\s,]+/).filter(Boolean)) {
    const range = token.match(/^([A-Za-z]*)(\d+)-\1?(\d+)$/);
    const expanded =
      range && Number(range[3]) >= Number(range[2]) && Number(range[3]) - Number(range[2]) < 100
        ? Array.from({ length: Number(range[3]) - Number(range[2]) + 1 }, (_, index) => `${range[1]}${Number(range[2]) + index}`)
        : [token];
    for (const entry of expanded) {
      const key = entry.toLowerCase();
      if (!seen.has(key) && entry.length <= 20) {
        seen.add(key);
        result.push(entry);
      }
    }
  }
  return result;
}
