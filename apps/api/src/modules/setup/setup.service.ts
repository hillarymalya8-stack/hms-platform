import { timingSafeEqual } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PosOutletType, Prisma, ProductType, RoleScope } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizeMenuDays, permissions, roleAccessLevels, storeAccess } from "@hms/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { barDrinkSku, barDrinksMenu, dailyBuffetMenu, dailyMenuSku, defaultMenu, defaultRoomFloors, defaultRoomType, menuSku } from "./default-catalog";
import { defaultChartOfAccounts, defaultNumberingRules, defaultStoreTypes } from "./default-setup";
import { RunSetupDto } from "./dto/run-setup.dto";

// Serialises concurrent setup attempts so only the first one can create the hotel.
const setupLockKey = 7_301_001;

@Injectable()
export class SetupService {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async status() {
    const users = await this.prisma.user.count();
    return {
      needsSetup: users === 0,
      setupKeyRequired: Boolean(this.config.get<string>("HMS_SETUP_KEY"))
    };
  }

  async run(dto: RunSetupDto, metadata: { ipAddress?: string; userAgent?: string }) {
    this.assertSetupKey(dto.setupKey);

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${setupLockKey})`;
        if ((await tx.user.count()) > 0) {
          throw new ConflictException("This system is already set up. Sign in with an existing account.");
        }

        await this.createHotel(tx, dto, adminEmail, passwordHash);
      },
      { timeout: 60_000, maxWait: 10_000 }
    );

    return this.auth.login({ email: adminEmail, password: dto.adminPassword }, metadata);
  }

  private assertSetupKey(provided?: string) {
    const expected = this.config.get<string>("HMS_SETUP_KEY");
    if (!expected) return;

    const a = Buffer.from(provided ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException("The setup key is not correct.");
    }
  }

  private async createHotel(tx: Prisma.TransactionClient, dto: RunSetupDto, adminEmail: string, passwordHash: string) {
    const hotelName = dto.hotelName.trim();
    const today = startOfUtcDay(new Date());

    const organization = await tx.organization.create({
      data: { code: organizationCodeFor(hotelName), name: hotelName }
    });

    const property = await tx.property.create({
      data: {
        organizationId: organization.id,
        code: "MAIN",
        name: hotelName,
        propertySettings: {
          create: {
            currencyCode: dto.currencyCode,
            currencySymbol: dto.currencySymbol.trim(),
            currencyPrecision: 2,
            fiscalYearStart: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
            numberingRules: defaultNumberingRules
          }
        }
      }
    });

    await tx.permission.createMany({ data: [...permissions], skipDuplicates: true });
    const permissionIdsByCode = new Map((await tx.permission.findMany()).map((permission) => [permission.code, permission.id]));

    const roleIdsByKey = new Map<string, string>();
    for (const accessLevel of roleAccessLevels) {
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          propertyId: property.id,
          name: accessLevel.name,
          scope: RoleScope.PROPERTY
        }
      });
      await tx.rolePermission.createMany({
        data: accessLevel.permissionCodes
          .map((code) => permissionIdsByCode.get(code))
          .filter((permissionId): permissionId is string => Boolean(permissionId))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true
      });
      roleIdsByKey.set(accessLevel.key, role.id);
    }

    const admin = await tx.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: dto.adminFullName.trim(),
        organizationId: organization.id,
        defaultPropertyId: property.id
      }
    });
    await tx.userRole.create({
      data: { userId: admin.id, roleId: roleIdsByKey.get("super-admin")!, propertyId: property.id }
    });

    await tx.businessDate.create({
      data: { propertyId: property.id, businessDate: today, openedById: admin.id }
    });
    await tx.financialPeriod.create({
      data: {
        propertyId: property.id,
        startDate: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
        endDate: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
      }
    });

    const accountIdsByCode = new Map<string, string>();
    for (const [accountCode, accountName, accountType, isControlAccount] of defaultChartOfAccounts) {
      const account = await tx.account.create({
        data: {
          organizationId: organization.id,
          propertyId: property.id,
          accountCode,
          accountName,
          accountType,
          isControlAccount
        }
      });
      accountIdsByCode.set(accountCode, account.id);
    }

    const department = await tx.department.create({
      data: { propertyId: property.id, code: "FNB", name: "Food and Beverage" }
    });

    const outlets = [
      { name: "Restaurant", type: PosOutletType.RESTAURANT, revenue: "4200", device: "REST-POS-01", drawer: "Main Drawer" },
      { name: "Bar", type: PosOutletType.BAR, revenue: "4300", device: "BAR-POS-01", drawer: "Bar Drawer" }
    ];
    let restaurantOutletId: string | undefined;
    let barOutletId: string | undefined;
    for (const outlet of outlets) {
      const created = await tx.posOutlet.create({
        data: {
          propertyId: property.id,
          departmentId: department.id,
          name: outlet.name,
          outletType: outlet.type,
          defaultRevenueAccountId: accountIdsByCode.get(outlet.revenue)
        }
      });
      if (outlet.type === PosOutletType.RESTAURANT) restaurantOutletId = created.id;
      if (outlet.type === PosOutletType.BAR) barOutletId = created.id;
      const terminal = await tx.posTerminal.create({
        data: { outletId: created.id, name: `${outlet.name} POS 01`, deviceIdentifier: outlet.device }
      });
      await tx.cashDrawer.create({
        data: { outletId: created.id, terminalId: terminal.id, name: outlet.drawer }
      });
    }

    await tx.productCategory.createMany({
      data: [
        { propertyId: property.id, name: "Food", revenueAccountId: accountIdsByCode.get("4200"), costAccountId: accountIdsByCode.get("5100") },
        { propertyId: property.id, name: "Drinks", revenueAccountId: accountIdsByCode.get("4300"), costAccountId: accountIdsByCode.get("5200") }
      ]
    });

    await this.createRoomsAndMenu(tx, property.id, restaurantOutletId!, accountIdsByCode);
    await this.createBarDrinks(tx, property.id, barOutletId!, accountIdsByCode);

    await tx.inventoryLocation.createMany({
      data: storeAccess.map((store) => ({
        propertyId: property.id,
        code: store.locationCode,
        name: store.label,
        locationType: defaultStoreTypes[store.locationCode]
      }))
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        propertyId: property.id,
        userId: admin.id,
        module: "setup",
        action: "initial_setup",
        recordType: "organization",
        recordId: organization.id,
        newValue: { hotel: hotelName, adminUser: adminEmail, currency: dto.currencyCode }
      }
    });
  }

  // Njiro Legacy bar drinks: a stock item and a stock-tracked Bar menu item per drink (same code).
  private async createBarDrinks(
    tx: Prisma.TransactionClient,
    propertyId: string,
    barOutletId: string,
    accountIdsByCode: Map<string, string>
  ) {
    for (const section of barDrinksMenu) {
      const category = await tx.productCategory.create({
        data: {
          propertyId,
          name: section.category,
          revenueAccountId: accountIdsByCode.get("4300"),
          costAccountId: accountIdsByCode.get("5200")
        }
      });
      for (const [index, [name, priceTzs]] of section.items.entries()) {
        const sku = barDrinkSku(section, index);
        await tx.inventoryItem.create({ data: { propertyId, sku, name, unitOfMeasure: "PCS" } });
        await tx.product.create({
          data: {
            propertyId,
            categoryId: category.id,
            name,
            sku,
            productType: ProductType.STOCKED,
            stockTracked: true,
            variants: {
              create: {
                name: "Standard",
                sku,
                basePrice: priceTzs,
                outletProducts: { create: { outletId: barOutletId, price: priceTzs, available: true } }
              }
            }
          }
        });
      }
    }
  }

  // Njiro Legacy rooms and restaurant menu (TSh and USD prices), see default-catalog.ts.
  private async createRoomsAndMenu(
    tx: Prisma.TransactionClient,
    propertyId: string,
    restaurantOutletId: string,
    accountIdsByCode: Map<string, string>
  ) {
    const roomType = await tx.roomType.create({ data: { propertyId, ...defaultRoomType, baseRate: 0 } });
    for (const floorDefinition of defaultRoomFloors) {
      const floor = await tx.floor.create({
        data: { propertyId, name: floorDefinition.name, sortOrder: floorDefinition.sortOrder }
      });
      await tx.room.createMany({
        data: floorDefinition.rooms.map((roomNumber) => ({ propertyId, roomTypeId: roomType.id, floorId: floor.id, roomNumber }))
      });
    }

    for (const section of defaultMenu) {
      const category = await tx.productCategory.create({
        data: {
          propertyId,
          name: section.category,
          revenueAccountId: accountIdsByCode.get("4200"),
          costAccountId: accountIdsByCode.get(section.category === "Hot Beverages" ? "5200" : "5100")
        }
      });
      for (const [index, [name, priceTzs, priceUsd]] of section.items.entries()) {
        const sku = menuSku(section, index);
        await tx.product.create({
          data: {
            propertyId,
            categoryId: category.id,
            name,
            sku,
            variants: {
              create: {
                name: "Standard",
                sku,
                basePrice: priceTzs,
                outletProducts: {
                  create: { outletId: restaurantOutletId, price: priceTzs, priceUsd, available: true }
                }
              }
            }
          }
        });
      }
    }

    // Daily buffet dishes sold one by one, each shown on the POS only on its days.
    for (const section of dailyBuffetMenu) {
      const category = await tx.productCategory.create({
        data: {
          propertyId,
          name: section.category,
          revenueAccountId: accountIdsByCode.get("4200"),
          costAccountId: accountIdsByCode.get("5100")
        }
      });
      for (const [index, [name, priceTzs, priceUsd, days]] of section.items.entries()) {
        const sku = dailyMenuSku(section, index);
        await tx.product.create({
          data: {
            propertyId,
            categoryId: category.id,
            name,
            sku,
            menuDays: normalizeMenuDays(days),
            variants: {
              create: {
                name: "Standard",
                sku,
                basePrice: priceTzs,
                outletProducts: {
                  create: { outletId: restaurantOutletId, price: priceTzs, priceUsd, available: true }
                }
              }
            }
          }
        });
      }
    }
  }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function organizationCodeFor(name: string) {
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return code || "HOTEL";
}
