import {
  AccountType,
  FinancialPeriodStatus,
  PosOutletType,
  PrismaClient,
  ProductType,
  RoleScope
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { permissions, roleAccessLevels } from "@hms/shared";

const prisma = new PrismaClient();

const fiscalYearStart = new Date("2026-01-01T00:00:00.000Z");
const currentBusinessDate = new Date("2026-08-31T00:00:00.000Z");
const periodStart = new Date("2026-08-01T00:00:00.000Z");
const periodEnd = new Date("2026-08-31T00:00:00.000Z");

const chartOfAccounts = [
  ["1100", "Cash", AccountType.ASSET, true],
  ["1200", "Bank", AccountType.ASSET, true],
  ["1300", "Accounts Receivable", AccountType.ASSET, true],
  ["1400", "Inventory", AccountType.ASSET, true],
  ["2100", "Accounts Payable", AccountType.LIABILITY, true],
  ["2200", "Tax Payable", AccountType.LIABILITY, true],
  ["2300", "Customer Deposits", AccountType.LIABILITY, true],
  ["3100", "Owner Capital", AccountType.EQUITY, false],
  ["3200", "Retained Earnings", AccountType.EQUITY, false],
  ["4100", "Room Revenue", AccountType.REVENUE, false],
  ["4200", "Restaurant Revenue", AccountType.REVENUE, false],
  ["4300", "Bar Revenue", AccountType.REVENUE, false],
  ["4400", "Other Revenue", AccountType.REVENUE, false],
  ["5100", "Food Cost", AccountType.COST_OF_SALES, false],
  ["5200", "Beverage Cost", AccountType.COST_OF_SALES, false],
  ["6100", "Salaries", AccountType.EXPENSE, false],
  ["6200", "Utilities", AccountType.EXPENSE, false],
  ["6300", "Repairs", AccountType.EXPENSE, false],
  ["6400", "Marketing", AccountType.EXPENSE, false],
  ["6500", "Other Expenses", AccountType.EXPENSE, false]
] as const;

async function main() {
  const organization = await prisma.organization.upsert({
    where: { code: "DEMO-HOTELS" },
    update: { name: "Demo Hotel Group" },
    create: { code: "DEMO-HOTELS", name: "Demo Hotel Group" }
  });

  const property = await prisma.property.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "MAIN"
      }
    },
    update: { name: "Main Demo Hotel" },
    create: {
      organizationId: organization.id,
      code: "MAIN",
      name: "Main Demo Hotel"
    }
  });

  await prisma.propertySetting.upsert({
    where: { propertyId: property.id },
    update: {
      currencyCode: "USD",
      currencySymbol: "$",
      currencyPrecision: 2
    },
    create: {
      propertyId: property.id,
      currencyCode: "USD",
      currencySymbol: "$",
      currencyPrecision: 2,
      fiscalYearStart,
      numberingRules: {
        reservation: "RES-{YYYY}-{00000}",
        receipt: "RCT-{YYYY}-{00000}",
        invoice: "INV-{YYYY}-{00000}",
        journal: "JRN-{YYYY}-{00000}"
      }
    }
  });

  for (const item of permissions) {
    await prisma.permission.upsert({
      where: { code: item.code },
      update: {
        module: item.module,
        action: item.action
      },
      create: item
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const permissionIdsByCode = new Map(allPermissions.map((permission) => [permission.code, permission.id]));
  const roleIdsByKey = new Map<string, string>();

  for (const accessLevel of roleAccessLevels) {
    let role = await prisma.role.findFirst({
      where: {
        organizationId: organization.id,
        propertyId: property.id,
        name: accessLevel.name
      }
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          organizationId: organization.id,
          propertyId: property.id,
          name: accessLevel.name,
          scope: RoleScope.PROPERTY
        }
      });
    }

    const permissionIds = accessLevel.permissionCodes
      .map((code) => permissionIdsByCode.get(code))
      .filter((permissionId): permissionId is string => Boolean(permissionId));

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: {
          notIn: permissionIds
        }
      }
    });

    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId
      })),
      skipDuplicates: true
    });

    roleIdsByKey.set(accessLevel.key, role.id);
  }

  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
  const superAdminAccessLevel = roleAccessLevels.find((accessLevel) => accessLevel.key === "super-admin");
  if (!superAdminAccessLevel?.defaultUser) {
    throw new Error("Super Administrator access level must define a default user.");
  }

  async function upsertSeedUser(email: string, fullName: string, roleKey: string) {
    const roleId = roleIdsByKey.get(roleKey);
    if (!roleId) {
      throw new Error(`Seed role not found: ${roleKey}`);
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        fullName,
        organizationId: organization.id,
        defaultPropertyId: property.id
      },
      create: {
        email,
        passwordHash,
        fullName,
        organizationId: organization.id,
        defaultPropertyId: property.id
      }
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId_propertyId: {
          userId: user.id,
          roleId,
          propertyId: property.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        roleId,
        propertyId: property.id
      }
    });

    return user;
  }

  const admin = await upsertSeedUser(
    superAdminAccessLevel.defaultUser.email,
    superAdminAccessLevel.defaultUser.fullName,
    superAdminAccessLevel.key
  );

  for (const accessLevel of roleAccessLevels) {
    if (!accessLevel.defaultUser || accessLevel.key === superAdminAccessLevel.key) {
      continue;
    }

    await upsertSeedUser(accessLevel.defaultUser.email, accessLevel.defaultUser.fullName, accessLevel.key);
  }

  await prisma.businessDate.upsert({
    where: {
      propertyId_businessDate: {
        propertyId: property.id,
        businessDate: currentBusinessDate
      }
    },
    update: {},
    create: {
      propertyId: property.id,
      businessDate: currentBusinessDate,
      openedById: admin.id
    }
  });

  await prisma.financialPeriod.upsert({
    where: {
      propertyId_startDate_endDate: {
        propertyId: property.id,
        startDate: periodStart,
        endDate: periodEnd
      }
    },
    update: {
      status: FinancialPeriodStatus.OPEN
    },
    create: {
      propertyId: property.id,
      startDate: periodStart,
      endDate: periodEnd,
      status: FinancialPeriodStatus.OPEN
    }
  });

  const firstFloor = await prisma.floor.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: "First Floor"
      }
    },
    update: {
      sortOrder: 1
    },
    create: {
      propertyId: property.id,
      name: "First Floor",
      sortOrder: 1
    }
  });

  const secondFloor = await prisma.floor.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: "Second Floor"
      }
    },
    update: {
      sortOrder: 2
    },
    create: {
      propertyId: property.id,
      name: "Second Floor",
      sortOrder: 2
    }
  });

  const standardRoomType = await prisma.roomType.upsert({
    where: {
      propertyId_code: {
        propertyId: property.id,
        code: "STD"
      }
    },
    update: {
      name: "Standard Room",
      baseRate: "95.00",
      baseOccupancy: 1,
      maxOccupancy: 2
    },
    create: {
      propertyId: property.id,
      code: "STD",
      name: "Standard Room",
      baseRate: "95.00",
      baseOccupancy: 1,
      maxOccupancy: 2
    }
  });

  const deluxeRoomType = await prisma.roomType.upsert({
    where: {
      propertyId_code: {
        propertyId: property.id,
        code: "DLX"
      }
    },
    update: {
      name: "Deluxe Room",
      baseRate: "145.00",
      baseOccupancy: 2,
      maxOccupancy: 3
    },
    create: {
      propertyId: property.id,
      code: "DLX",
      name: "Deluxe Room",
      baseRate: "145.00",
      baseOccupancy: 2,
      maxOccupancy: 3
    }
  });

  const rooms = [
    ["101", standardRoomType.id, firstFloor.id],
    ["102", standardRoomType.id, firstFloor.id],
    ["201", deluxeRoomType.id, secondFloor.id],
    ["202", deluxeRoomType.id, secondFloor.id]
  ] as const;

  for (const [roomNumber, roomTypeId, floorId] of rooms) {
    await prisma.room.upsert({
      where: {
        propertyId_roomNumber: {
          propertyId: property.id,
          roomNumber
        }
      },
      update: {
        roomTypeId,
        floorId
      },
      create: {
        propertyId: property.id,
        roomTypeId,
        floorId,
        roomNumber
      }
    });
  }

  await prisma.guest.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: "guest@example.com"
      }
    },
    update: {
      firstName: "Amina",
      lastName: "Mussa",
      propertyId: property.id,
      phone: "+255700000000"
    },
    create: {
      organizationId: organization.id,
      propertyId: property.id,
      firstName: "Amina",
      lastName: "Mussa",
      email: "guest@example.com",
      phone: "+255700000000"
    }
  });

  for (const [accountCode, accountName, accountType, isControlAccount] of chartOfAccounts) {
    await prisma.account.upsert({
      where: {
        organizationId_propertyId_accountCode: {
          organizationId: organization.id,
          propertyId: property.id,
          accountCode
        }
      },
      update: {
        accountName,
        accountType,
        isControlAccount
      },
      create: {
        organizationId: organization.id,
        propertyId: property.id,
        accountCode,
        accountName,
        accountType,
        isControlAccount
      }
    });
  }

  const restaurantRevenue = await prisma.account.findUniqueOrThrow({
    where: {
      organizationId_propertyId_accountCode: {
        organizationId: organization.id,
        propertyId: property.id,
        accountCode: "4200"
      }
    }
  });

  const barRevenue = await prisma.account.findUniqueOrThrow({
    where: {
      organizationId_propertyId_accountCode: {
        organizationId: organization.id,
        propertyId: property.id,
        accountCode: "4300"
      }
    }
  });

  const foodCost = await prisma.account.findUniqueOrThrow({
    where: {
      organizationId_propertyId_accountCode: {
        organizationId: organization.id,
        propertyId: property.id,
        accountCode: "5100"
      }
    }
  });

  const beverageCost = await prisma.account.findUniqueOrThrow({
    where: {
      organizationId_propertyId_accountCode: {
        organizationId: organization.id,
        propertyId: property.id,
        accountCode: "5200"
      }
    }
  });

  const restaurantDepartment = await prisma.department.upsert({
    where: {
      propertyId_code: {
        propertyId: property.id,
        code: "FNB"
      }
    },
    update: {
      name: "Food and Beverage"
    },
    create: {
      propertyId: property.id,
      code: "FNB",
      name: "Food and Beverage"
    }
  });

  const restaurantOutlet = await prisma.posOutlet.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: "Restaurant"
      }
    },
    update: {
      departmentId: restaurantDepartment.id,
      defaultRevenueAccountId: restaurantRevenue.id,
      outletType: PosOutletType.RESTAURANT
    },
    create: {
      propertyId: property.id,
      departmentId: restaurantDepartment.id,
      name: "Restaurant",
      outletType: PosOutletType.RESTAURANT,
      defaultRevenueAccountId: restaurantRevenue.id
    }
  });

  const restaurantTerminal = await prisma.posTerminal.upsert({
    where: {
      outletId_deviceIdentifier: {
        outletId: restaurantOutlet.id,
        deviceIdentifier: "REST-POS-01"
      }
    },
    update: {
      name: "Restaurant POS 01"
    },
    create: {
      outletId: restaurantOutlet.id,
      name: "Restaurant POS 01",
      deviceIdentifier: "REST-POS-01"
    }
  });

  await prisma.cashDrawer.upsert({
    where: {
      outletId_name: {
        outletId: restaurantOutlet.id,
        name: "Main Drawer"
      }
    },
    update: {
      terminalId: restaurantTerminal.id
    },
    create: {
      outletId: restaurantOutlet.id,
      terminalId: restaurantTerminal.id,
      name: "Main Drawer"
    }
  });

  const barOutlet = await prisma.posOutlet.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: "Bar"
      }
    },
    update: {
      departmentId: restaurantDepartment.id,
      defaultRevenueAccountId: barRevenue.id,
      outletType: PosOutletType.BAR
    },
    create: {
      propertyId: property.id,
      departmentId: restaurantDepartment.id,
      name: "Bar",
      outletType: PosOutletType.BAR,
      defaultRevenueAccountId: barRevenue.id
    }
  });

  const barTerminal = await prisma.posTerminal.upsert({
    where: {
      outletId_deviceIdentifier: {
        outletId: barOutlet.id,
        deviceIdentifier: "BAR-POS-01"
      }
    },
    update: {
      name: "Bar POS 01"
    },
    create: {
      outletId: barOutlet.id,
      name: "Bar POS 01",
      deviceIdentifier: "BAR-POS-01"
    }
  });

  await prisma.cashDrawer.upsert({
    where: {
      outletId_name: {
        outletId: barOutlet.id,
        name: "Bar Drawer"
      }
    },
    update: {
      terminalId: barTerminal.id
    },
    create: {
      outletId: barOutlet.id,
      terminalId: barTerminal.id,
      name: "Bar Drawer"
    }
  });

  const foodCategory = await prisma.productCategory.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: "Food"
      }
    },
    update: {
      revenueAccountId: restaurantRevenue.id,
      costAccountId: foodCost.id
    },
    create: {
      propertyId: property.id,
      name: "Food",
      revenueAccountId: restaurantRevenue.id,
      costAccountId: foodCost.id
    }
  });

  const drinksCategory = await prisma.productCategory.upsert({
    where: {
      propertyId_name: {
        propertyId: property.id,
        name: "Drinks"
      }
    },
    update: {
      revenueAccountId: barRevenue.id,
      costAccountId: beverageCost.id
    },
    create: {
      propertyId: property.id,
      name: "Drinks",
      revenueAccountId: barRevenue.id,
      costAccountId: beverageCost.id
    }
  });

  const posProducts = [
    {
      categoryId: foodCategory.id,
      name: "Chicken Burger",
      sku: "FOOD-BURGER",
      variantName: "Regular",
      variantSku: "FOOD-BURGER-REG",
      price: "12.50"
    },
    {
      categoryId: foodCategory.id,
      name: "Grilled Fish",
      sku: "FOOD-FISH",
      variantName: "Plate",
      variantSku: "FOOD-FISH-PLATE",
      price: "18.00"
    },
    {
      categoryId: drinksCategory.id,
      name: "Fresh Juice",
      sku: "DRINK-JUICE",
      variantName: "Glass",
      variantSku: "DRINK-JUICE-GLASS",
      price: "4.50"
    },
    {
      categoryId: drinksCategory.id,
      name: "Bottled Water",
      sku: "DRINK-WATER",
      variantName: "Bottle",
      variantSku: "DRINK-WATER-BOTTLE",
      price: "2.00"
    },
    {
      categoryId: drinksCategory.id,
      name: "House Soda",
      sku: "DRINK-SODA",
      variantName: "Bottle",
      variantSku: "DRINK-SODA-BOTTLE",
      price: "3.00"
    }
  ];

  for (const item of posProducts) {
    const product = await prisma.product.upsert({
      where: {
        propertyId_sku: {
          propertyId: property.id,
          sku: item.sku
        }
      },
      update: {
        categoryId: item.categoryId,
        name: item.name
      },
      create: {
        propertyId: property.id,
        categoryId: item.categoryId,
        name: item.name,
        sku: item.sku,
        productType: ProductType.NON_STOCKED
      }
    });

    const variant = await prisma.productVariant.upsert({
      where: {
        productId_sku: {
          productId: product.id,
          sku: item.variantSku
        }
      },
      update: {
        name: item.variantName,
        basePrice: item.price
      },
      create: {
        productId: product.id,
        name: item.variantName,
        sku: item.variantSku,
        basePrice: item.price
      }
    });

    const outletAssignments =
      item.categoryId === drinksCategory.id ? [restaurantOutlet.id, barOutlet.id] : [restaurantOutlet.id];

    for (const outletId of outletAssignments) {
      await prisma.outletProduct.upsert({
        where: {
          outletId_productVariantId: {
            outletId,
            productVariantId: variant.id
          }
        },
        update: {
          price: item.price,
          taxRate: "0.1600",
          available: true
        },
        create: {
          outletId,
          productVariantId: variant.id,
          price: item.price,
          taxRate: "0.1600"
        }
      });
    }
  }

  for (const table of [
    ["T1", "Main Floor", 2],
    ["T2", "Main Floor", 4],
    ["T3", "Terrace", 4]
  ] as const) {
    await prisma.diningTable.upsert({
      where: {
        outletId_tableNumber: {
          outletId: restaurantOutlet.id,
          tableNumber: table[0]
        }
      },
      update: {
        section: table[1],
        seats: table[2]
      },
      create: {
        outletId: restaurantOutlet.id,
        tableNumber: table[0],
        section: table[1],
        seats: table[2]
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      propertyId: property.id,
      userId: admin.id,
      module: "foundation",
      action: "seed",
      recordType: "organization",
      recordId: organization.id,
      newValue: {
        organization: organization.code,
        property: property.code,
        adminUser: admin.email
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
