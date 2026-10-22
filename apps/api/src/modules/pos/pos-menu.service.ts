import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canUseOutlet } from "@hms/shared";
import { PosOutletType, Prisma, ProductType } from "@prisma/client";
import { UserContext } from "../../common/auth/user-context";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateDiningTableDto, CreatePosProductDto, CreateProductCategoryDto, UpdatePosProductDto } from "./dto/menu.dto";

const DEFAULT_VARIANT_NAME = "Standard";

type OutletRef = { id: string; name: string; outletType: PosOutletType };

// Menu management: categories, sellable products (with a default variant) and the
// per-outlet price list (OutletProduct). Staff only see and change outlet prices for
// outlets their outlet-scope permissions allow (see packages/shared/src/outlet-access.ts).
@Injectable()
export class PosMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenu(user: UserContext) {
    const propertyId = requireProperty(user);
    const [outlets, categories, products] = await Promise.all([
      this.accessibleOutlets(user, propertyId),
      this.prisma.productCategory.findMany({
        where: { propertyId },
        include: { _count: { select: { products: true } } },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { propertyId },
        include: {
          category: true,
          variants: {
            include: { outletProducts: { include: { outlet: true } } },
            orderBy: { createdAt: "asc" }
          }
        },
        orderBy: [{ active: "desc" }, { name: "asc" }]
      })
    ]);
    const outletIds = new Set(outlets.map((outlet) => outlet.id));

    return {
      outlets,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        active: category.active,
        productCount: category._count.products
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        active: product.active,
        stockTracked: product.stockTracked,
        productType: product.productType,
        category: { id: product.category.id, name: product.category.name },
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          active: variant.active,
          basePrice: variant.basePrice.toFixed(2),
          outlets: variant.outletProducts
            .filter((entry) => outletIds.has(entry.outletId))
            .map((entry) => ({
              outletId: entry.outletId,
              outletName: entry.outlet.name,
              outletType: entry.outlet.outletType,
              price: entry.price.toFixed(2),
              priceUsd: entry.priceUsd ? entry.priceUsd.toFixed(2) : null,
              taxRate: entry.taxRate.toFixed(4),
              available: entry.available
            }))
            .sort((a, b) => a.outletName.localeCompare(b.outletName))
        }))
      }))
    };
  }

  async createCategory(user: UserContext, dto: CreateProductCategoryDto) {
    const propertyId = requireProperty(user);
    const name = dto.name.trim();

    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findFirst({ where: { id: dto.parentId, propertyId } });
      if (!parent) throw new NotFoundException("Parent category was not found.");
    }

    const existing = await this.prisma.productCategory.findFirst({
      where: { propertyId, name: { equals: name, mode: "insensitive" } }
    });
    if (existing) throw new ConflictException(`A category named "${existing.name}" already exists.`);

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.create({
        data: { propertyId, name, parentId: dto.parentId }
      });
      await audit(tx, user, propertyId, "create_category", "product_category", category.id, undefined, {
        name: category.name,
        parentId: category.parentId
      });
      return category;
    });
  }

  async createProduct(user: UserContext, dto: CreatePosProductDto) {
    const propertyId = requireProperty(user);
    const sku = dto.sku.trim().toUpperCase();
    const price = new Prisma.Decimal(dto.price);
    const priceUsd = dto.priceUsd ? new Prisma.Decimal(dto.priceUsd) : null;
    const taxRate = new Prisma.Decimal(dto.taxRate ?? "0");

    const category = await this.prisma.productCategory.findFirst({ where: { id: dto.categoryId, propertyId } });
    if (!category) throw new NotFoundException("Product category was not found.");

    const outlets = await this.resolveOutlets(user, propertyId, dto.outletIds);

    const duplicate = await this.prisma.product.findFirst({ where: { propertyId, sku } });
    if (duplicate) throw new ConflictException(`SKU ${sku} is already used by ${duplicate.name}.`);

    const productId = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          propertyId,
          categoryId: category.id,
          name: dto.name.trim(),
          sku,
          stockTracked: dto.stockTracked ?? false,
          productType: dto.stockTracked ? ProductType.STOCKED : ProductType.NON_STOCKED,
          variants: {
            create: {
              name: DEFAULT_VARIANT_NAME,
              sku,
              basePrice: price,
              outletProducts: {
                create: outlets.map((outlet) => ({ outletId: outlet.id, price, priceUsd, taxRate, available: true }))
              }
            }
          }
        }
      });

      await audit(tx, user, propertyId, "create_product", "product", product.id, undefined, {
        name: product.name,
        sku: product.sku,
        categoryId: category.id,
        price: price.toFixed(2),
        priceUsd: priceUsd?.toFixed(2) ?? null,
        taxRate: taxRate.toFixed(4),
        outlets: outlets.map((outlet) => outlet.name)
      });

      return product.id;
    });

    return this.loadProduct(user, productId);
  }

  async updateProduct(user: UserContext, productId: string, dto: UpdatePosProductDto) {
    const propertyId = requireProperty(user);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, propertyId },
      include: {
        variants: {
          include: { outletProducts: { include: { outlet: true } } },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!product) throw new NotFoundException("Product was not found.");

    const variant = product.variants.find((entry) => entry.active) ?? product.variants[0];
    if (!variant) throw new BadRequestException("This product has no variant to price.");

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findFirst({ where: { id: dto.categoryId, propertyId } });
      if (!category) throw new NotFoundException("Product category was not found.");
    }

    const accessible = await this.accessibleOutlets(user, propertyId);
    const accessibleIds = new Set(accessible.map((outlet) => outlet.id));
    const targetOutlets = dto.outletIds ? await this.resolveOutlets(user, propertyId, dto.outletIds) : null;

    const price = dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined;
    // undefined leaves the USD price alone; "" clears it.
    const priceUsd = dto.priceUsd === undefined ? undefined : dto.priceUsd ? new Prisma.Decimal(dto.priceUsd) : null;
    const taxRate = dto.taxRate !== undefined ? new Prisma.Decimal(dto.taxRate) : undefined;
    const currentScoped = variant.outletProducts.filter((entry) => accessibleIds.has(entry.outletId));
    const fallbackTaxRate = currentScoped[0]?.taxRate ?? variant.outletProducts[0]?.taxRate ?? new Prisma.Decimal(0);

    const previousValue = {
      name: product.name,
      categoryId: product.categoryId,
      active: product.active,
      price: variant.basePrice.toFixed(2),
      outlets: currentScoped.map((entry) => ({
        outlet: entry.outlet.name,
        price: entry.price.toFixed(2),
        priceUsd: entry.priceUsd?.toFixed(2) ?? null,
        taxRate: entry.taxRate.toFixed(4),
        available: entry.available
      }))
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          name: dto.name?.trim(),
          categoryId: dto.categoryId,
          active: dto.active
        }
      });

      if (price) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { basePrice: price } });
      }

      if (targetOutlets) {
        const targetIds = new Set(targetOutlets.map((outlet) => outlet.id));
        const removed = currentScoped.filter((entry) => !targetIds.has(entry.outletId)).map((entry) => entry.outletId);
        if (removed.length > 0) {
          await tx.outletProduct.deleteMany({
            where: { productVariantId: variant.id, outletId: { in: removed } }
          });
        }
        const existingIds = new Set(variant.outletProducts.map((entry) => entry.outletId));
        const added = targetOutlets.filter((outlet) => !existingIds.has(outlet.id));
        if (added.length > 0) {
          await tx.outletProduct.createMany({
            data: added.map((outlet) => ({
              outletId: outlet.id,
              productVariantId: variant.id,
              price: price ?? variant.basePrice,
              priceUsd: priceUsd !== undefined ? priceUsd : (currentScoped[0]?.priceUsd ?? variant.outletProducts[0]?.priceUsd ?? null),
              taxRate: taxRate ?? fallbackTaxRate,
              available: dto.available ?? true
            }))
          });
        }
      }

      // Price, tax and availability changes apply to every outlet this user manages.
      const scopedIds = targetOutlets ? targetOutlets.map((outlet) => outlet.id) : currentScoped.map((entry) => entry.outletId);
      if (scopedIds.length > 0 && (price || priceUsd !== undefined || taxRate || dto.available !== undefined)) {
        await tx.outletProduct.updateMany({
          where: { productVariantId: variant.id, outletId: { in: scopedIds } },
          data: { price, priceUsd, taxRate, available: dto.available }
        });
      }

      // Retiring a product removes it from every menu, including outlets outside this user's scope.
      if (dto.active === false) {
        await tx.outletProduct.updateMany({
          where: { productVariant: { productId: product.id } },
          data: { available: false }
        });
      }

      await audit(tx, user, propertyId, "update_product", "product", product.id, previousValue, {
        name: dto.name,
        categoryId: dto.categoryId,
        active: dto.active,
        price: price?.toFixed(2),
        priceUsd: priceUsd === undefined ? undefined : (priceUsd?.toFixed(2) ?? null),
        taxRate: taxRate?.toFixed(4),
        available: dto.available,
        outlets: targetOutlets?.map((outlet) => outlet.name)
      });
    });

    return this.loadProduct(user, product.id);
  }

  async listTables(user: UserContext, outletId: string) {
    const propertyId = requireProperty(user);
    const outlet = await this.findAccessibleOutlet(user, propertyId, outletId);
    return this.prisma.diningTable.findMany({
      where: { outletId: outlet.id },
      orderBy: { tableNumber: "asc" }
    });
  }

  async createTable(user: UserContext, outletId: string, dto: CreateDiningTableDto) {
    const propertyId = requireProperty(user);
    const outlet = await this.findAccessibleOutlet(user, propertyId, outletId);
    const tableNumber = dto.tableNumber.trim();

    const existing = await this.prisma.diningTable.findUnique({
      where: { outletId_tableNumber: { outletId: outlet.id, tableNumber } }
    });
    if (existing) throw new ConflictException(`Table ${tableNumber} already exists at ${outlet.name}.`);

    return this.prisma.$transaction(async (tx) => {
      const table = await tx.diningTable.create({
        data: {
          outletId: outlet.id,
          tableNumber,
          section: dto.section?.trim() || null,
          seats: dto.seats ?? 2
        }
      });
      await audit(tx, user, propertyId, "create_table", "dining_table", table.id, undefined, {
        outlet: outlet.name,
        tableNumber: table.tableNumber,
        section: table.section,
        seats: table.seats
      });
      return table;
    });
  }

  async listTerminals(user: UserContext) {
    const propertyId = requireProperty(user);
    const outlets = await this.accessibleOutlets(user, propertyId);
    const terminals = await this.prisma.posTerminal.findMany({
      where: { outletId: { in: outlets.map((outlet) => outlet.id) } },
      include: { outlet: { select: { id: true, name: true, outletType: true } } },
      orderBy: [{ outlet: { name: "asc" } }, { name: "asc" }]
    });
    return terminals.map((terminal) => ({
      id: terminal.id,
      name: terminal.name,
      deviceIdentifier: terminal.deviceIdentifier,
      syncStatus: terminal.syncStatus,
      lastSeenAt: terminal.lastSeenAt,
      outlet: terminal.outlet
    }));
  }

  private async loadProduct(user: UserContext, productId: string) {
    const menu = await this.getMenu(user);
    const product = menu.products.find((entry) => entry.id === productId);
    if (!product) throw new NotFoundException("Product was not found.");
    return product;
  }

  private accessibleOutlets(user: UserContext, propertyId: string): Promise<OutletRef[]> {
    return this.prisma.posOutlet.findMany({
      where: { propertyId, active: true, outletType: { in: allowedOutletTypes(user) } },
      select: { id: true, name: true, outletType: true },
      orderBy: { name: "asc" }
    });
  }

  private async findAccessibleOutlet(user: UserContext, propertyId: string, outletId: string) {
    const outlet = await this.prisma.posOutlet.findFirst({ where: { id: outletId, propertyId } });
    if (!outlet) throw new NotFoundException("POS outlet was not found.");
    if (!canUseOutlet(user.permissions, outlet.outletType)) {
      throw new ForbiddenException(`You do not have access to the ${outlet.name} outlet.`);
    }
    return outlet;
  }

  private async resolveOutlets(user: UserContext, propertyId: string, outletIds: string[]): Promise<OutletRef[]> {
    if (outletIds.length === 0) return [];
    const outlets = await this.prisma.posOutlet.findMany({
      where: { id: { in: outletIds }, propertyId, active: true },
      select: { id: true, name: true, outletType: true }
    });
    if (outlets.length !== new Set(outletIds).size) {
      throw new NotFoundException("One or more outlets were not found or are inactive.");
    }
    const denied = outlets.find((outlet) => !canUseOutlet(user.permissions, outlet.outletType));
    if (denied) throw new ForbiddenException(`You do not have access to the ${denied.name} outlet.`);
    return outlets;
  }
}

function requireProperty(user: UserContext) {
  if (!user.propertyId) {
    throw new BadRequestException("A property context is required.");
  }
  return user.propertyId;
}

function allowedOutletTypes(user: UserContext) {
  return Object.values(PosOutletType).filter((outletType) => canUseOutlet(user.permissions, outletType));
}

function audit(
  tx: Prisma.TransactionClient,
  user: UserContext,
  propertyId: string,
  action: string,
  recordType: string,
  recordId: string,
  previousValue: Record<string, unknown> | undefined,
  newValue: Record<string, unknown>
) {
  return tx.auditLog.create({
    data: {
      organizationId: user.organizationId,
      propertyId,
      userId: user.userId,
      module: "pos",
      action,
      recordType,
      recordId,
      previousValue: previousValue ? (JSON.parse(JSON.stringify(previousValue)) as Prisma.InputJsonValue) : undefined,
      newValue: JSON.parse(JSON.stringify(newValue)) as Prisma.InputJsonValue
    }
  });
}
