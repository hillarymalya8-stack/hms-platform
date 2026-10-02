import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UserContext } from "../../common/auth/user-context";
import { PersistenceStage, RecordTransitionDto } from "./dto/record-transition.dto";

type PersistenceAreaStatus = {
  id: string;
  name: string;
  datastore: string;
  apiSurface: string;
  stage: PersistenceStage;
  requiredChecks: string[];
};

const areas: PersistenceAreaStatus[] = [
  {
    id: "front-office",
    name: "Front Office",
    datastore: "Guests, reservations, folios, room status",
    apiSurface: "/front-office/*",
    stage: "DB_READY",
    requiredChecks: ["schema", "validation", "audit", "permissions", "save-and-reload tests"]
  },
  {
    id: "pos",
    name: "POS Cashier",
    datastore: "Outlets, orders, order items, payments",
    apiSurface: "/pos/*",
    stage: "DB_READY",
    requiredChecks: ["payment receipt policy", "idempotency", "journal posting", "audit", "tests"]
  },
  {
    id: "inventory",
    name: "Inventory Control",
    datastore: "Items, locations, stock balances, stock movements",
    apiSurface: "/inventory/*",
    stage: "SCHEMA_READY",
    requiredChecks: ["schema", "movement service", "weighted average cost", "audit", "tests"]
  },
  {
    id: "purchasing",
    name: "Purchasing and AP",
    datastore: "Suppliers, purchase orders, goods received, supplier invoices",
    apiSurface: "/purchasing/*",
    stage: "SCHEMA_READY",
    requiredChecks: ["schema", "approval workflow", "invoice matching", "AP posting", "tests"]
  },
  {
    id: "finance",
    name: "Finance Close",
    datastore: "Accounts, periods, journals, journal lines",
    apiSurface: "/accounting/*",
    stage: "DB_READY",
    requiredChecks: ["balanced journals", "period lock", "close guard", "audit", "tests"]
  },
  {
    id: "reports",
    name: "Management Reports",
    datastore: "Report snapshots and export queue",
    apiSurface: "/reports/*",
    stage: "SCHEMA_READY",
    requiredChecks: ["query views", "export queue", "permission guard", "audit", "tests"]
  },
  {
    id: "admin",
    name: "Administration",
    datastore: "Users, roles, permissions, settings, audit",
    apiSurface: "/users, /iam, /properties, /audit",
    stage: "API_READY",
    requiredChecks: ["role APIs", "settings APIs", "audit search", "MFA policy", "tests"]
  },
  {
    id: "offline-sync",
    name: "Offline POS Sync",
    datastore: "Terminals, devices, sync queue, conflict ledger",
    apiSurface: "/sync/*",
    stage: "SCHEMA_READY",
    requiredChecks: ["schema", "idempotency ledger", "retry route", "conflict resolution", "tests"]
  }
];

@Injectable()
export class PersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return {
      phase: "Phase 10 Backend Persistence",
      generatedAt: new Date().toISOString(),
      checklist: [
        "Add or confirm database models and migrations for each workflow.",
        "Create API endpoints with validation and permission checks.",
        "Persist create/update actions and reload saved data.",
        "Record audit events for sensitive transitions.",
        "Add save-and-reload tests before marking a module production ready."
      ],
      areas
    };
  }

  async recordTransition(user: UserContext, dto: RecordTransitionDto) {
    const area = areas.find((entry) => entry.id === dto.moduleId);

    if (!area) {
      throw new NotFoundException(`Persistence area ${dto.moduleId} was not found.`);
    }

    const transition = await this.prisma.persistenceTransition.create({
      data: {
        organizationId: user.organizationId,
        propertyId: user.propertyId,
        userId: user.userId,
        moduleId: area.id,
        moduleName: area.name,
        previousStage: area.stage,
        targetStage: dto.targetStage,
        note: dto.note,
        requiredChecks: area.requiredChecks
      }
    });

    return {
      id: transition.id,
      phase: "Phase 10 Backend Persistence",
      moduleId: area.id,
      moduleName: area.name,
      previousStage: area.stage,
      targetStage: dto.targetStage,
      note: transition.note,
      requiredChecks: area.requiredChecks,
      actor: {
        userId: user.userId,
        email: user.email,
        organizationId: user.organizationId,
        propertyId: user.propertyId ?? null
      },
      createdAt: transition.createdAt.toISOString()
    };
  }
}
