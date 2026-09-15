import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LegalLookupSummary,
  MatterDetail,
  MatterListQuery,
  MatterSummary,
  MatterState,
  MatterPriority,
  CreateMatterRequest,
  UpdateMatterRequest,
} from "@law/api-interfaces";
import {
  paginationMeta,
  parseSort,
  PlatformPrismaService,
  PaginationQueryDto,
  TenantContextService,
} from "@law/core";
import {
  Prisma,
  PrismaClient as TenantPrismaClient,
} from "@prisma/tenant-client";

interface MatterRecord {
  id: string;
  workspaceId: string;
  internalNumber: string | null;
  title: string;
  state: MatterState;
  priority: MatterPriority;
  description: string | null;
  responsibleUserId: string | null;
  openedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  practiceArea: LookupRecord | null;
  stage: LookupRecord | null;
  clients: Array<{
    id: string;
    isPrimary: boolean;
    notes: string | null;
    client: ClientRecord;
  }>;
  participants: Array<unknown>;
  proceedings: Array<unknown>;
}

interface ClientRecord {
  id: string;
  clientCode: string;
  status: "ACTIVE" | "INACTIVE";
  responsibleUserId: string | null;
  openedAt: Date;
  archivedAt: Date | null;
  party: PartyRecord;
}

interface PartyRecord {
  id: string;
  type: "PERSON" | "ORGANIZATION";
  displayName: string;
  legalName: string | null;
  tradeName: string | null;
}

interface LookupRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

@Injectable()
export class MattersService {
  constructor(private readonly platformPrisma: PlatformPrismaService) {}

  private get db(): TenantPrismaClient {
    return TenantContextService.required.prisma;
  }

  private get workspaceId(): string {
    return TenantContextService.required.workspaceId;
  }

  async list(query: MatterListQuery & PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = parseSort(
      query.sort,
      [
        "internalNumber",
        "title",
        "state",
        "priority",
        "createdAt",
        "updatedAt",
      ],
      [{ field: "updatedAt", direction: "desc" }],
    );
    const search = query.search?.trim();
    const where: Prisma.MatterWhereInput = {
      workspaceId: this.workspaceId,
      ...(query.state ? { state: query.state as never } : {}),
      ...(query.priority ? { priority: query.priority as never } : {}),
      ...(query.practiceAreaId ? { practiceAreaId: query.practiceAreaId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.responsibleUserId
        ? { responsibleUserId: query.responsibleUserId }
        : {}),
      ...(query.clientId
        ? { clients: { some: { clientId: query.clientId } } }
        : {}),
      ...(search
        ? {
            OR: [
              { internalNumber: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
              {
                clients: {
                  some: {
                    client: {
                      party: {
                        displayName: { contains: search, mode: "insensitive" },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, totalItems] = await Promise.all([
      this.db.matter.findMany({
        where,
        orderBy: sort.map((item) => ({ [item.field]: item.direction })),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          practiceArea: true,
          stage: true,
          clients: { include: { client: { include: { party: true } } } },
        },
      }),
      this.db.matter.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toSummary(row as unknown as MatterRecord)),
      meta: paginationMeta(page, pageSize, totalItems, sort),
    };
  }

  async get(id: string): Promise<MatterDetail> {
    const matter = await this.requireMatter(id);
    return this.toDetail(matter);
  }

  async create(input: CreateMatterRequest): Promise<MatterDetail> {
    await this.validateReferences(input);
    const matter = await this.db.matter.create({
      data: {
        workspaceId: this.workspaceId,
        title: input.title.trim(),
        description: input.description,
        priority: input.priority ?? "NORMAL",
        practiceAreaId: input.practiceAreaId,
        stageId: input.stageId,
        responsibleUserId: input.responsibleUserId,
        createdByUserId: TenantContextService.required.userId,
        updatedByUserId: TenantContextService.required.userId,
        clients: input.clientIds?.length
          ? {
              create: input.clientIds.map((clientId) => ({
                clientId,
                isPrimary: clientId === input.primaryClientId,
              })),
            }
          : undefined,
      },
      include: this.matterInclude(),
    });
    return this.toDetail(matter as unknown as MatterRecord);
  }

  async update(id: string, input: UpdateMatterRequest): Promise<MatterDetail> {
    await this.requireMatter(id);
    await this.validateReferences(input);
    const matter = await this.db.matter.update({
      where: { id },
      data: input,
      include: this.matterInclude(),
    });
    return this.toDetail(matter as unknown as MatterRecord);
  }

  async open(id: string): Promise<MatterDetail> {
    const current = await this.requireMatter(id);
    if (current.state !== "DRAFT")
      throw new BadRequestException("Only draft Matters can be opened");
    if (current.clients.length === 0)
      throw new BadRequestException(
        "An open Matter requires at least one Client",
      );
    const year = new Date().getUTCFullYear();
    const matter = await this.db.$transaction(async (tx) => {
      const counter = await tx.matterNumberCounter.upsert({
        where: { workspaceId_year: { workspaceId: this.workspaceId, year } },
        create: { workspaceId: this.workspaceId, year, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      const number = `${year}-${String(counter.nextValue - 1).padStart(5, "0")}`;
      return tx.matter.update({
        where: { id },
        data: {
          state: "OPEN",
          internalNumber: number,
          openedAt: new Date(),
          updatedByUserId: TenantContextService.required.userId,
        },
        include: this.matterInclude(),
      });
    });
    return this.toDetail(matter as unknown as MatterRecord);
  }

  async close(id: string): Promise<MatterDetail> {
    const current = await this.requireMatter(id);
    if (current.state !== "OPEN")
      throw new BadRequestException("Only open Matters can be closed");
    const matter = await this.db.matter.update({
      where: { id },
      data: {
        state: "CLOSED",
        closedAt: new Date(),
        updatedByUserId: TenantContextService.required.userId,
      },
      include: this.matterInclude(),
    });
    return this.toDetail(matter as unknown as MatterRecord);
  }

  async archive(id: string): Promise<MatterDetail> {
    const matter = await this.requireMatter(id);
    const updated = await this.db.matter.update({
      where: { id: matter.id },
      data: {
        archivedAt: new Date(),
        updatedByUserId: TenantContextService.required.userId,
      },
      include: this.matterInclude(),
    });
    return this.toDetail(updated as unknown as MatterRecord);
  }

  private async requireMatter(id: string): Promise<MatterRecord> {
    const matter = await this.db.matter.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: this.matterInclude(),
    });
    if (!matter) throw new NotFoundException("Matter not found");
    return matter as unknown as MatterRecord;
  }

  private async validateReferences(
    input: CreateMatterRequest | UpdateMatterRequest,
  ): Promise<void> {
    if (input.practiceAreaId) {
      const found = await this.db.practiceArea.findFirst({
        where: { id: input.practiceAreaId, workspaceId: this.workspaceId },
      });
      if (!found) throw new BadRequestException("Practice area not found");
    }
    if (input.stageId) {
      const found = await this.db.matterStage.findFirst({
        where: { id: input.stageId, workspaceId: this.workspaceId },
      });
      if (!found) throw new BadRequestException("Matter stage not found");
    }
    if (input.responsibleUserId) {
      const found = await this.platformPrisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: input.responsibleUserId,
            workspaceId: this.workspaceId,
          },
        },
        select: { status: true },
      });
      if (!found || found.status !== "ACTIVE")
        throw new BadRequestException(
          "Responsible user is not an active workspace member",
        );
    }
    if ("clientIds" in input && input.clientIds?.length) {
      const count = await this.db.client.count({
        where: { workspaceId: this.workspaceId, id: { in: input.clientIds } },
      });
      if (count !== new Set(input.clientIds).size)
        throw new BadRequestException("One or more Clients were not found");
      if (
        input.primaryClientId &&
        !input.clientIds.includes(input.primaryClientId)
      )
        throw new BadRequestException(
          "Primary Client must be attached to the Matter",
        );
    }
  }

  private matterInclude() {
    return {
      practiceArea: true,
      stage: true,
      clients: { include: { client: { include: { party: true } } } },
      participants: {
        include: { party: true, roles: { include: { role: true } } },
      },
      proceedings: { include: { type: true } },
    } as const;
  }

  private toSummary(matter: MatterRecord): MatterSummary {
    return {
      id: matter.id,
      internalNumber: matter.internalNumber,
      title: matter.title,
      state: matter.state,
      priority: matter.priority,
      practiceArea: matter.practiceArea
        ? this.lookup(matter.practiceArea)
        : null,
      stage: matter.stage ? this.lookup(matter.stage) : null,
      responsibleUserId: matter.responsibleUserId,
      clientCount: matter.clients.length,
      openedAt: matter.openedAt?.toISOString() ?? null,
      archivedAt: matter.archivedAt?.toISOString() ?? null,
      createdAt: matter.createdAt.toISOString(),
      updatedAt: matter.updatedAt.toISOString(),
    };
  }

  private toDetail(matter: MatterRecord): MatterDetail {
    return {
      ...this.toSummary(matter),
      description: matter.description,
      clients: matter.clients.map((item) => ({
        id: item.id,
        isPrimary: item.isPrimary,
        notes: item.notes,
        client: this.clientSummary(item.client),
      })),
      participants: [],
      proceedings: [],
    };
  }

  private clientSummary(client: ClientRecord) {
    return {
      id: client.id,
      clientCode: client.clientCode,
      status: client.status,
      party: {
        id: client.party.id,
        type: client.party.type,
        displayName: client.party.displayName,
        secondaryText: client.party.legalName ?? client.party.tradeName ?? null,
      },
      responsibleUserId: client.responsibleUserId,
      openedAt: client.openedAt.toISOString(),
      archivedAt: client.archivedAt?.toISOString() ?? null,
    };
  }

  private lookup(value: LookupRecord): LegalLookupSummary {
    return {
      id: value.id,
      code: value.code,
      name: value.name,
      isActive: value.isActive,
      sortOrder: value.sortOrder,
    };
  }
}
