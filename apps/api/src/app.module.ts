import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { FrontOfficeModule } from "./modules/front-office/front-office.module";
import { IamModule } from "./modules/iam/iam.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PersistenceModule } from "./modules/persistence/persistence.module";
import { PosModule } from "./modules/pos/pos.module";
import { PropertiesModule } from "./modules/properties/properties.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { PermissionsGuard } from "./common/auth/permissions.guard";
import { PrismaModule } from "./common/prisma/prisma.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IamModule,
    AuthModule,
    FrontOfficeModule,
    InventoryModule,
    InvoicesModule,
    PosModule,
    UsersModule,
    OrganizationsModule,
    PropertiesModule,
    PersistenceModule,
    ReportsModule,
    AccountingModule,
    AuditModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard
    }
  ]
})
export class AppModule {}
