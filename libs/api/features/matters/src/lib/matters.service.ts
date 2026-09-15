import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  PrismaClient as TenantPrismaClient,
} from "@prisma/tenant-client";
import { PlatformPrismaService, TenantContextService } from "@law/core";
import { CreateMatterDto, UpdateMatterDto } from "./matters.dto";

@Injectable()
export class MattersService {
  constructor(private readonly platformPrisma: PlatformPrismaService) {}

  private get context() {
    return TenantContextService.required;
  }

  private get db(): TenantPrismaClient {
    return this.context.prisma;
  }

  private async requireResponsibleUser(
    userId: string | undefined,
  ): Promise<void> {
    if (!userId) return;
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

  private async nextNumber(tx: Prisma.TransactionClient): Promise<string> {
    const counter = await tx.domainCounter.upsert({
      where: {
        workspaceId_name: {
          workspaceId: this.context.workspaceId,
          name: "MATTER",
        },
      },
      create: {
        workspaceId: this.context.workspaceId,
        name: "MATTER",
        value: 1,
      },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return `MT-${String(counter.value).padStart(6, "0")}`;
  }

  private async requireClientLinks(matterId: string): Promise<void> {
    const activeClientLinks = await this.db.matterClient.findMany({
      where: { matterId, workspaceId: this.context.workspaceId },
      select: { clientId: true },
    });
    if (!activeClientLinks.length) {
      throw new BadRequestException(
        "A matter must have at least one active client before opening",
      );
    }
  }

  async createDraft(input: CreateMatterDto) {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException("Matter title is required");
    await this.requireResponsibleUser(input.responsibleUserId);

    const matter = await this.db.$transaction(async (tx) => {
      const created = await tx.matter.create({
        data: {
          workspaceId: this.context.workspaceId,
          matterNumber: await this.nextNumber(tx),
          title,
          description: input.description?.trim(),
          status: "DRAFT",
          priority: input.priority ?? "NORMAL",
          practiceAreaId: input.practiceAreaId,
          stageId: input.stageId,
          responsibleUserId: input.responsibleUserId ?? this.context.userId,
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
          ...(input.clientIds?.length
            ? {
                clients: {
                  create: input.clientIds.map((clientId) => ({
                    workspaceId: this.context.workspaceId,
                    clientId,
                    isPrimary: false,
                  })),
                },
              }
            : {}),
        },
      });
      return created;
    });

    return {
      ...matter,
      matterNumber: matter.matterNumber,
      status: matter.status,
      openedAt: matter.openedAt?.toISOString() ?? null,
      closedAt: matter.closedAt?.toISOString() ?? null,
      createdAt: matter.createdAt.toISOString(),
      updatedAt: matter.updatedAt.toISOString(),
    };
  }

  async open(matterId: string) {
    const matter = await this.db.matter.findFirst({
      where: { id: matterId, workspaceId: this.context.workspaceId },
    });
    if (!matter) throw new NotFoundException("Matter not found");
    if (!matter.title?.trim()) {
      throw new BadRequestException("Matter title is required");
    }
    await this.requireClientLinks(matterId);

    const updated = await this.db.matter.update({
      where: { id: matterId },
      data: {
        status: "OPEN",
        openedAt: new Date(),
        updatedByUserId: this.context.userId,
      },
    });

    return { ...updated, status: updated.status };
  }

  async update(matterId: string, input: UpdateMatterDto) {
    const matter = await this.db.matter.findFirst({
      where: { id: matterId, workspaceId: this.context.workspaceId },
    });
    if (!matter) throw new NotFoundException("Matter not found");
    const title = input.title?.trim();
    if (title !== undefined && !title) {
      throw new BadRequestException("Matter title is required");
    }

    return this.db.matter.update({
      where: { id: matterId },
      data: {
        ...(title !== undefined && { title }),
        ...(input.description !== undefined && {
          description: input.description?.trim() || null,
        }),
        ...(input.practiceAreaId !== undefined && {
          practiceAreaId: input.practiceAreaId,
        }),
        ...(input.stageId !== undefined && { stageId: input.stageId }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.openedAt !== undefined && {
          openedAt: new Date(input.openedAt),
        }),
        ...(input.closedAt !== undefined && {
          closedAt: new Date(input.closedAt),
        }),
        updatedByUserId: this.context.userId,
      },
    });
  }
}
