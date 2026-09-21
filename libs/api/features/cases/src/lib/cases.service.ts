import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Case, Prisma } from "@prisma/client";
import {
  PlatformPrismaService,
  paginationMeta,
  parseSort,
  WorkspaceContextService,
} from "@law/core";
import {
  CaseDetail,
  CaseListResponse,
  CaseNumberFormat,
  CaseSummary,
} from "@law/api-interfaces";
import {
  CaseActivityDto,
  CaseListQueryDto,
  CaseResponsibilityDto,
  CloseCaseDto,
  CreateCaseDto,
  UpdateCaseActivityDto,
  UpdateCaseDto,
  UpdateCaseResponsibilityDto,
} from "./cases.dto";

@Injectable()
export class CasesService {
  constructor(private readonly platformPrisma: PlatformPrismaService) {}

  private get context() {
    return WorkspaceContextService.required;
  }
  private get db(): PlatformPrismaService {
    return this.platformPrisma;
  }

  private async requireResponsibleUser(userId: string): Promise<void> {
    const membership = await this.platformPrisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: this.context.workspaceId },
      },
      select: { role: true, status: true },
    });
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      !["OWNER", "ADMIN", "LAWYER"].includes(membership.role)
    ) {
      throw new BadRequestException(
        "Responsible user must be an active lawyer in this workspace",
      );
    }
  }

  private async requireReferences(input: {
    caseTypeId?: string;
    practiceAreaId?: string;
    tagIds?: string[];
  }): Promise<void> {
    const { workspaceId } = this.context;
    if (
      input.caseTypeId &&
      !(await this.db.caseType.findFirst({
        where: { id: input.caseTypeId, workspaceId, isActive: true },
      }))
    )
      throw new BadRequestException("Case type is unavailable");
    if (
      input.practiceAreaId &&
      !(await this.db.practiceArea.findFirst({
        where: { id: input.practiceAreaId, workspaceId, isActive: true },
      }))
    )
      throw new BadRequestException("Practice area is unavailable");
    if (input.tagIds?.length) {
      const count = await this.db.tag.count({
        where: { id: { in: input.tagIds }, workspaceId, isActive: true },
      });
      if (count !== new Set(input.tagIds).size)
        throw new BadRequestException("One or more tags are unavailable");
    }
  }

  private async requireCase(caseId: string): Promise<Case> {
    const item = await this.db.case.findFirst({
      where: { id: caseId, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Case not found");
    return item;
  }

  private caseNumberPattern(
    format: CaseNumberFormat,
    year: number,
  ): { regex: RegExp; sequenceWidth: number } {
    const tokenPattern = /YYYY|YY|N+/g;
    let source = "^";
    let cursor = 0;
    let sequenceWidth = 0;

    for (const match of format.matchAll(tokenPattern)) {
      const token = match[0];
      const index = match.index;
      source += format
        .slice(cursor, index)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (token === "YYYY") source += String(year);
      else if (token === "YY") source += String(year).slice(-2);
      else {
        if (sequenceWidth)
          throw new Error("Case number format has multiple sequence tokens");
        sequenceWidth = token.length;
        source += "(\\d+)";
      }
      cursor = index + token.length;
    }

    source += format.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!sequenceWidth)
      throw new Error("Case number format has no sequence token");

    return { regex: new RegExp(`${source}$`), sequenceWidth };
  }

  private renderCaseNumber(
    format: CaseNumberFormat,
    year: number,
    sequence: number,
  ): string {
    return format.replace(/YYYY|YY|N+/g, (token) => {
      if (token === "YYYY") return String(year);
      if (token === "YY") return String(year).slice(-2);
      return String(sequence).padStart(token.length, "0");
    });
  }

  private async nextNumberForFormat(
    format: CaseNumberFormat,
    year: number,
  ): Promise<string> {
    const { regex, sequenceWidth } = this.caseNumberPattern(format, year);
    const cases = await this.db.case.findMany({
      where: { workspaceId: this.context.workspaceId },
      select: { caseNumber: true },
    });
    const highestFormattedSequence = cases.reduce((highest, item) => {
      const match = regex.exec(item.caseNumber);
      const value = Number(match?.[1]);
      return Number.isInteger(value) && value > highest ? value : highest;
    }, 0);
    const nextSequence = Math.max(highestFormattedSequence, cases.length) + 1;

    return this.renderCaseNumber(format, year, nextSequence).replace(
      /N+/,
      String(nextSequence).padStart(sequenceWidth, "0"),
    );
  }

  private async nextNumber(format: CaseNumberFormat): Promise<string> {
    const year = new Date().getFullYear();
    try {
      return await this.nextNumberForFormat(format, year);
    } catch {
      try {
        return await this.nextNumberForFormat("YYYY-N", year);
      } catch {
        return `${year}-1`;
      }
    }
  }

  private caseNumber(input: string): string {
    const value = input.trim();
    if (!value) throw new BadRequestException("Case number is required");
    return value;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (error as { code?: string }).code === "P2002";
  }

  async nextNumberSuggestion(
    format: CaseNumberFormat = "YYYY-N",
  ): Promise<{ caseNumber: string }> {
    return { caseNumber: await this.nextNumber(format) };
  }

  private summary(item: Case): CaseSummary {
    return {
      id: item.id,
      caseNumber: item.caseNumber,
      clientId: item.clientId,
      name: item.name,
      status: item.status,
      priority: item.priority,
      responsibleUserId: item.responsibleUserId,
      openedDate: item.openedDate?.toISOString() ?? null,
      closedDate: item.closedDate?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async list(query: CaseListQueryDto): Promise<CaseListResponse> {
    const { workspaceId } = this.context;
    const sort = parseSort(
      query.sort,
      [
        "caseNumber",
        "name",
        "status",
        "priority",
        "openedDate",
        "updatedAt",
        "createdAt",
      ],
      [{ field: "updatedAt", direction: "desc" }],
    );
    const clientFilter = clientIdFilter(query);
    const where: Prisma.CaseWhereInput = {
      workspaceId,
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(clientFilter && { clientId: clientFilter }),
      ...(query.responsibleUserId && {
        responsibleUserId: query.responsibleUserId,
      }),
      ...(query.caseTypeId && { caseTypeId: query.caseTypeId }),
      ...(query.practiceAreaId && { practiceAreaId: query.practiceAreaId }),
      ...(query.tags?.length && {
        tags: { some: { tagId: { in: query.tags } } },
      }),
      ...(query.search?.trim() && {
        OR: ["caseNumber", "name", "externalReference"].map((field) => ({
          [field]: { contains: query.search!.trim(), mode: "insensitive" },
        })),
      }),
    };
    const [totalItems, items] = await this.db.$transaction([
      this.db.case.count({ where }),
      this.db.case.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: sort.map(({ field, direction }) => ({ [field]: direction })),
      }),
    ]);
    return {
      items: items.map((item) => this.summary(item)),
      meta: paginationMeta(query.page, query.pageSize, totalItems, sort),
    };
  }

  async get(caseId: string): Promise<CaseDetail> {
    const item = await this.db.case.findFirst({
      where: { id: caseId, workspaceId: this.context.workspaceId },
      include: { tags: { include: { tag: true } } },
    });
    if (!item) throw new NotFoundException("Case not found");
    return {
      ...this.summary(item),
      description: item.description,
      caseTypeId: item.caseTypeId,
      practiceAreaId: item.practiceAreaId,
      closingNote: item.closingNote,
      externalReference: item.externalReference,
      confidentialityLevel: item.confidentialityLevel,
      customFields: item.customFields as Record<string, unknown> | null,
      tags: item.tags.map(({ tag }) => ({
        id: tag.id,
        name: tag.name,
        isActive: tag.isActive,
      })),
    };
  }

  async create(input: CreateCaseDto): Promise<CaseDetail> {
    await this.requireResponsibleUser(input.responsibleUserId);
    await this.requireReferences(input);
    const { workspaceId, userId } = this.context;
    const client = await this.db.client.findFirst({
      where: { id: input.clientId, workspaceId, status: "ACTIVE" },
    });
    if (!client)
      throw new BadRequestException(
        "Case client must be active and available in this workspace",
      );
    if (!input.name.trim())
      throw new BadRequestException("Case name is required");
    try {
      const item = await this.db.$transaction(async (tx) => {
        const created = await tx.case.create({
          data: {
            workspaceId,
            caseNumber: this.caseNumber(input.caseNumber),
            clientId: input.clientId,
            name: input.name.trim(),
            description: input.description?.trim(),
            caseTypeId: input.caseTypeId,
            practiceAreaId: input.practiceAreaId,
            status: input.status,
            priority: input.priority ?? "NORMAL",
            responsibleUserId: input.responsibleUserId,
            openedDate: input.openedDate
              ? new Date(input.openedDate)
              : undefined,
            externalReference: input.externalReference?.trim(),
            confidentialityLevel: input.confidentialityLevel?.trim(),
            customFields: input.customFields as
              | Prisma.InputJsonValue
              | undefined,
            createdByUserId: userId,
            updatedByUserId: userId,
            tags: input.tagIds?.length
              ? { create: input.tagIds.map((tagId) => ({ tagId })) }
              : undefined,
            responsibilities: {
              create: {
                workspaceId,
                userId: input.responsibleUserId,
                isPrimary: true,
                createdByUserId: userId,
                updatedByUserId: userId,
              },
            },
            activities: {
              create: {
                workspaceId,
                type: "NOTE",
                title: "Case created",
                activityDate: new Date(),
                source: "SYSTEM",
                createdByUserId: userId,
                updatedByUserId: userId,
              },
            },
          },
        });
        return created;
      });
      return this.get(item.id);
    } catch (error) {
      if (this.isUniqueConstraintError(error))
        throw new BadRequestException("Case number already exists");
      throw error;
    }
  }

  async update(caseId: string, input: UpdateCaseDto): Promise<CaseDetail> {
    await this.requireCase(caseId);
    await this.requireReferences(input);
    const { userId, workspaceId } = this.context;
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException("Case name is required");
    try {
      await this.db.$transaction(async (tx) => {
        await tx.case.update({
          where: { id: caseId },
          data: {
            ...(input.caseNumber !== undefined && {
              caseNumber: this.caseNumber(input.caseNumber),
            }),
            ...(input.name !== undefined && { name: input.name.trim() }),
            ...(input.description !== undefined && {
              description: input.description.trim() || null,
            }),
            ...(input.caseTypeId !== undefined && {
              caseTypeId: input.caseTypeId,
            }),
            ...(input.practiceAreaId !== undefined && {
              practiceAreaId: input.practiceAreaId,
            }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.priority !== undefined && { priority: input.priority }),
            ...(input.openedDate !== undefined && {
              openedDate: new Date(input.openedDate),
            }),
            ...(input.externalReference !== undefined && {
              externalReference: input.externalReference.trim() || null,
            }),
            ...(input.confidentialityLevel !== undefined && {
              confidentialityLevel: input.confidentialityLevel.trim() || null,
            }),
            ...(input.customFields !== undefined && {
              customFields: input.customFields as Prisma.InputJsonValue,
            }),
            ...(input.tagIds !== undefined && {
              tags: {
                deleteMany: {},
                create: input.tagIds.map((tagId) => ({ tagId })),
              },
            }),
            updatedByUserId: userId,
          },
        });
        await tx.caseActivity.create({
          data: {
            workspaceId,
            caseId,
            type: "NOTE",
            title: "Case information updated",
            activityDate: new Date(),
            source: "SYSTEM",
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error))
        throw new BadRequestException("Case number already exists");
      throw error;
    }
    return this.get(caseId);
  }

  async transition(
    caseId: string,
    target: "ACTIVE" | "ON_HOLD" | "ARCHIVED",
  ): Promise<CaseDetail> {
    const allowed: Record<typeof target, string[]> = {
      ACTIVE: ["DRAFT", "ON_HOLD"],
      ON_HOLD: ["ACTIVE"],
      ARCHIVED: ["CLOSED"],
    };
    const { workspaceId, userId } = this.context;
    await this.db.$transaction(async (tx) => {
      const item = await tx.case.findFirst({
        where: { id: caseId, workspaceId },
      });
      if (!item) throw new NotFoundException("Case not found");
      if (!allowed[target].includes(item.status))
        throw new BadRequestException(
          `Cannot transition case from ${item.status} to ${target}`,
        );
      await tx.case.update({
        where: { id: caseId },
        data: { status: target, updatedByUserId: userId },
      });
      await tx.caseActivity.create({
        data: {
          workspaceId,
          caseId,
          type: "NOTE",
          title: `Case ${target === "ON_HOLD" ? "put on hold" : target.toLowerCase()}`,
          activityDate: new Date(),
          source: "SYSTEM",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
    });
    return this.get(caseId);
  }

  async close(caseId: string, input: CloseCaseDto): Promise<CaseDetail> {
    const { workspaceId, userId } = this.context;
    await this.db.$transaction(async (tx) => {
      const item = await tx.case.findFirst({
        where: { id: caseId, workspaceId },
      });
      if (!item) throw new NotFoundException("Case not found");
      if (!["ACTIVE", "ON_HOLD"].includes(item.status))
        throw new BadRequestException(
          "Only active or on-hold cases can be closed",
        );
      await tx.case.update({
        where: { id: caseId },
        data: {
          status: "CLOSED",
          closedDate: new Date(input.closedDate),
          closingNote: input.closingNote?.trim() || null,
          updatedByUserId: userId,
        },
      });
      await tx.caseActivity.create({
        data: {
          workspaceId,
          caseId,
          type: "NOTE",
          title: "Case closed",
          description: input.closingNote?.trim(),
          activityDate: new Date(input.closedDate),
          source: "SYSTEM",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
    });
    return this.get(caseId);
  }

  async reopen(caseId: string): Promise<CaseDetail> {
    const { workspaceId, userId } = this.context;
    await this.db.$transaction(async (tx) => {
      const item = await tx.case.findFirst({
        where: { id: caseId, workspaceId },
      });
      if (!item) throw new NotFoundException("Case not found");
      if (item.status !== "CLOSED")
        throw new BadRequestException("Only closed cases can be reopened");
      await tx.case.update({
        where: { id: caseId },
        data: {
          status: "ACTIVE",
          closedDate: null,
          closingNote: null,
          updatedByUserId: userId,
        },
      });
      await tx.caseActivity.create({
        data: {
          workspaceId,
          caseId,
          type: "NOTE",
          title: "Case reopened",
          activityDate: new Date(),
          source: "SYSTEM",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
    });
    return this.get(caseId);
  }

  async listActivities(caseId: string) {
    await this.requireCase(caseId);
    return this.db.caseActivity.findMany({
      where: { caseId, workspaceId: this.context.workspaceId },
      orderBy: { activityDate: "desc" },
    });
  }
  async createActivity(caseId: string, input: CaseActivityDto) {
    await this.requireCase(caseId);
    const { workspaceId, userId } = this.context;
    return this.db.caseActivity.create({
      data: {
        workspaceId,
        caseId,
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim(),
        activityDate: new Date(input.activityDate),
        source: "MANUAL",
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });
  }
  async updateActivity(
    caseId: string,
    activityId: string,
    input: UpdateCaseActivityDto,
  ) {
    await this.requireCase(caseId);
    const activity = await this.db.caseActivity.findFirst({
      where: { id: activityId, caseId, workspaceId: this.context.workspaceId },
    });
    if (!activity) throw new NotFoundException("Case activity not found");
    if (activity.source !== "MANUAL")
      throw new BadRequestException("System activities cannot be edited");
    return this.db.caseActivity.update({
      where: { id: activityId },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.description !== undefined && {
          description: input.description.trim() || null,
        }),
        ...(input.activityDate !== undefined && {
          activityDate: new Date(input.activityDate),
        }),
        updatedByUserId: this.context.userId,
      },
    });
  }

  async listResponsibilities(caseId: string) {
    await this.requireCase(caseId);
    return this.db.caseResponsibility.findMany({
      where: { caseId, workspaceId: this.context.workspaceId },
      orderBy: [
        { endedAt: "asc" },
        { isPrimary: "desc" },
        { startedAt: "asc" },
      ],
    });
  }
  async addResponsibility(caseId: string, input: CaseResponsibilityDto) {
    await this.requireCase(caseId);
    await this.requireResponsibleUser(input.userId);
    const { workspaceId, userId } = this.context;
    const responsibility = await this.db.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.caseResponsibility.updateMany({
          where: { caseId, workspaceId, endedAt: null, isPrimary: true },
          data: { isPrimary: false, updatedByUserId: userId },
        });
        await tx.case.update({
          where: { id: caseId },
          data: { responsibleUserId: input.userId, updatedByUserId: userId },
        });
      }
      return tx.caseResponsibility.create({
        data: {
          workspaceId,
          caseId,
          userId: input.userId,
          isPrimary: input.isPrimary ?? false,
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
    });
    return responsibility;
  }
  async updateResponsibility(
    caseId: string,
    responsibilityId: string,
    input: UpdateCaseResponsibilityDto,
  ) {
    await this.requireCase(caseId);
    const item = await this.db.caseResponsibility.findFirst({
      where: {
        id: responsibilityId,
        caseId,
        workspaceId: this.context.workspaceId,
      },
    });
    if (!item) throw new NotFoundException("Case responsibility not found");
    if (item.endedAt)
      throw new BadRequestException("Ended responsibilities cannot be updated");
    return this.db.caseResponsibility.update({
      where: { id: responsibilityId },
      data: {
        ...(input.startedAt !== undefined && {
          startedAt: new Date(input.startedAt),
        }),
        updatedByUserId: this.context.userId,
      },
    });
  }
  async endResponsibility(caseId: string, responsibilityId: string) {
    await this.requireCase(caseId);
    const { workspaceId, userId } = this.context;
    return this.db.$transaction(async (tx) => {
      const item = await tx.caseResponsibility.findFirst({
        where: { id: responsibilityId, caseId, workspaceId, endedAt: null },
      });
      if (!item)
        throw new NotFoundException("Active case responsibility not found");
      if (item.isPrimary)
        throw new BadRequestException(
          "Assign another primary responsibility before ending this one",
        );
      return tx.caseResponsibility.update({
        where: { id: responsibilityId },
        data: { endedAt: new Date(), updatedByUserId: userId },
      });
    });
  }
  async setPrimary(caseId: string, responsibilityId: string) {
    await this.requireCase(caseId);
    const { workspaceId, userId } = this.context;
    return this.db.$transaction(async (tx) => {
      const item = await tx.caseResponsibility.findFirst({
        where: { id: responsibilityId, caseId, workspaceId, endedAt: null },
      });
      if (!item)
        throw new NotFoundException("Active case responsibility not found");
      await this.requireResponsibleUser(item.userId);
      await tx.caseResponsibility.updateMany({
        where: {
          caseId,
          workspaceId,
          endedAt: null,
          isPrimary: true,
          NOT: { id: responsibilityId },
        },
        data: { isPrimary: false, updatedByUserId: userId },
      });
      await tx.caseResponsibility.update({
        where: { id: responsibilityId },
        data: { isPrimary: true, updatedByUserId: userId },
      });
      await tx.case.update({
        where: { id: caseId },
        data: { responsibleUserId: item.userId, updatedByUserId: userId },
      });
      return tx.caseResponsibility.findUniqueOrThrow({
        where: { id: responsibilityId },
      });
    });
  }
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clientIdFilter(
  query: CaseListQueryDto,
): string | { in: string[] } | undefined {
  const ids = uniqueIds([
    ...(query.clientId ? [query.clientId] : []),
    ...(query.clientIds ?? []),
  ]);
  if (!ids.length) return undefined;
  if (ids.length === 1) return ids[0];
  return { in: ids };
}
