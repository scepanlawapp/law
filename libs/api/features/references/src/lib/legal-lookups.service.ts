import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LegalLookupSummary,
  LookupListQuery,
  CreateLookupRequest,
  UpdateLookupRequest,
} from "@law/api-interfaces";
import { TenantContextService } from "@law/core";
import { PrismaClient as TenantPrismaClient } from "@prisma/tenant-client";
import { LookupKindParam } from "./legal-lookups.dto";

type LookupRow = {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  isActive: boolean;
  isSystemSeed: boolean;
  sortOrder: number;
  practiceAreaId?: string | null;
};

type LookupModel = {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, string>;
  }): Promise<LookupRow[]>;
  create(args: { data: Record<string, unknown> }): Promise<LookupRow>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<LookupRow>;
};

@Injectable()
export class LegalLookupsService {
  private get db(): TenantPrismaClient {
    return TenantContextService.required.prisma;
  }

  private get workspaceId(): string {
    return TenantContextService.required.workspaceId;
  }

  async list(
    kind: LookupKindParam,
    query: LookupListQuery = {},
  ): Promise<LegalLookupSummary[]> {
    const model = this.model(kind);
    const where: Record<string, unknown> = {
      workspaceId: this.workspaceId,
      ...(query.includeInactive ? {} : { isActive: true }),
    };
    if (kind === "matter-stages" && query.practiceAreaId) {
      where.practiceAreaId = query.practiceAreaId;
    }
    const rows = await model.findMany({ where, orderBy: { sortOrder: "asc" } });
    return rows.map((row) => this.toSummary(row));
  }

  async create(
    kind: LookupKindParam,
    input: CreateLookupRequest,
  ): Promise<LegalLookupSummary> {
    const model = this.model(kind);
    const code = input.code.trim().toUpperCase();
    if (kind === "matter-stages" && input.practiceAreaId) {
      const practiceArea = await this.db.practiceArea.findFirst({
        where: { id: input.practiceAreaId, workspaceId: this.workspaceId },
      });
      if (!practiceArea) throw new NotFoundException("Practice area not found");
    }
    try {
      const row = await model.create({
        data: {
          workspaceId: this.workspaceId,
          code,
          name: input.name.trim(),
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
          isSystemSeed: false,
          ...(kind === "matter-stages"
            ? { practiceAreaId: input.practiceAreaId }
            : {}),
        },
      });
      return this.toSummary(row);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Unique constraint")
      ) {
        throw new ConflictException("A lookup with this code already exists");
      }
      throw error;
    }
  }

  async update(
    kind: LookupKindParam,
    id: string,
    input: UpdateLookupRequest,
  ): Promise<LegalLookupSummary> {
    const model = this.model(kind);
    const existing = await this.find(kind, id, true);
    if (kind === "matter-stages" && input.practiceAreaId) {
      const practiceArea = await this.db.practiceArea.findFirst({
        where: { id: input.practiceAreaId, workspaceId: this.workspaceId },
      });
      if (!practiceArea) throw new NotFoundException("Practice area not found");
    }
    const row = await model.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(kind === "matter-stages"
          ? { practiceAreaId: input.practiceAreaId }
          : {}),
      },
    });
    return this.toSummary(row);
  }

  async deactivate(
    kind: LookupKindParam,
    id: string,
  ): Promise<LegalLookupSummary> {
    const model = this.model(kind);
    const existing = await this.find(kind, id, true);
    const row = await model.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return this.toSummary(row);
  }

  private async find(
    kind: LookupKindParam,
    id: string,
    includeInactive: boolean,
  ): Promise<LookupRow> {
    const rows = await this.model(kind).findMany({
      where: {
        id,
        workspaceId: this.workspaceId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { sortOrder: "asc" },
    });
    const row = rows[0];
    if (!row) throw new NotFoundException("Lookup not found");
    return row;
  }

  private model(kind: LookupKindParam): LookupModel {
    const db = this.db as unknown as Record<string, LookupModel>;
    const modelName: Record<LookupKindParam, string> = {
      "practice-areas": "practiceArea",
      "matter-stages": "matterStage",
      "participant-roles": "participantRole",
      "proceeding-types": "proceedingType",
      "document-categories": "documentCategory",
      "organization-relationship-types": "organizationRelationshipType",
    };
    return db[modelName[kind]];
  }

  private toSummary(row: LookupRow): LegalLookupSummary {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }
}
