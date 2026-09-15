import { BadRequestException, Injectable } from "@nestjs/common";
import { PlatformPrismaService, TenantContextService } from "@law/core";
import { PrismaClient as TenantPrismaClient } from "@prisma/tenant-client";
import { ReferenceDto } from "./references.dto";

type Resource =
  | "tag"
  | "caseType"
  | "practiceArea"
  | "matterStage"
  | "participantRole"
  | "proceedingType"
  | "documentCategory"
  | "organizationRelationshipType";
const countries = [
  { code: "RS", name: "Serbia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "HR", name: "Croatia" },
  { code: "ME", name: "Montenegro" },
  { code: "MK", name: "North Macedonia" },
  { code: "SI", name: "Slovenia" },
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
];

@Injectable()
export class ReferencesService {
  constructor(private readonly platformPrisma: PlatformPrismaService) {}
  private get context() {
    return TenantContextService.required;
  }
  private get db(): TenantPrismaClient {
    return this.context.prisma;
  }
  async users() {
    return this.platformPrisma.workspaceMember.findMany({
      where: { workspaceId: this.context.workspaceId, status: "ACTIVE" },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { user: { email: "asc" } },
    });
  }
  countries() {
    return countries;
  }
  async list(resource: Resource) {
    if (resource === "tag") {
      return this.db.tag.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    if (resource === "caseType") {
      return this.db.caseType.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    if (resource === "practiceArea") {
      return this.db.practiceArea.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    if (resource === "matterStage") {
      return this.db.matterStage.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    if (resource === "participantRole") {
      return this.db.participantRole.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    if (resource === "proceedingType") {
      return this.db.proceedingType.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    if (resource === "documentCategory") {
      return this.db.documentCategory.findMany({
        where: { workspaceId: this.context.workspaceId },
        orderBy: { name: "asc" },
      });
    }
    return this.db.organizationRelationshipType.findMany({
      where: { workspaceId: this.context.workspaceId },
      orderBy: { name: "asc" },
    });
  }
  async create(resource: Resource, input: ReferenceDto) {
    this.validateName(input);
    const audit = {
      workspaceId: this.context.workspaceId,
      name: input.name.trim(),
      isActive: input.isActive ?? true,
      createdByUserId: this.context.userId,
      updatedByUserId: this.context.userId,
    };
    if (resource === "tag") {
      return this.db.tag.create({
        data: { ...audit, color: input.color?.trim() },
      });
    }
    if (resource === "caseType") {
      return this.db.caseType.create({
        data: { ...audit, description: input.description?.trim() },
      });
    }
    if (resource === "practiceArea") {
      return this.db.practiceArea.create({
        data: { ...audit, description: input.description?.trim() },
      });
    }
    if (resource === "matterStage") {
      return this.db.matterStage.create({
        data: { ...audit, description: input.description?.trim() },
      });
    }
    if (resource === "participantRole") {
      return this.db.participantRole.create({
        data: { ...audit, description: input.description?.trim() },
      });
    }
    if (resource === "proceedingType") {
      return this.db.proceedingType.create({
        data: { ...audit, description: input.description?.trim() },
      });
    }
    if (resource === "documentCategory") {
      return this.db.documentCategory.create({
        data: { ...audit, description: input.description?.trim() },
      });
    }
    return this.db.organizationRelationshipType.create({
      data: { ...audit, description: input.description?.trim() },
    });
  }
  async update(resource: Resource, id: string, input: ReferenceDto) {
    this.validateName(input);
    const audit = {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedByUserId: this.context.userId,
    };
    if (resource === "tag") {
      await this.requireTag(id);
      return this.db.tag.update({
        where: { id },
        data: {
          ...audit,
          ...(input.color !== undefined && {
            color: input.color.trim() || null,
          }),
        },
      });
    }
    if (resource === "caseType") {
      await this.requireCaseType(id);
      return this.db.caseType.update({
        where: { id },
        data: {
          ...audit,
          ...(input.description !== undefined && {
            description: input.description.trim() || null,
          }),
        },
      });
    }
    if (resource === "practiceArea") {
      await this.requirePracticeArea(id);
      return this.db.practiceArea.update({
        where: { id },
        data: {
          ...audit,
          ...(input.description !== undefined && {
            description: input.description.trim() || null,
          }),
        },
      });
    }
    if (resource === "matterStage") {
      await this.requireMatterStage(id);
      return this.db.matterStage.update({
        where: { id },
        data: {
          ...audit,
          ...(input.description !== undefined && {
            description: input.description.trim() || null,
          }),
        },
      });
    }
    if (resource === "participantRole") {
      await this.requireParticipantRole(id);
      return this.db.participantRole.update({
        where: { id },
        data: {
          ...audit,
          ...(input.description !== undefined && {
            description: input.description.trim() || null,
          }),
        },
      });
    }
    if (resource === "proceedingType") {
      await this.requireProceedingType(id);
      return this.db.proceedingType.update({
        where: { id },
        data: {
          ...audit,
          ...(input.description !== undefined && {
            description: input.description.trim() || null,
          }),
        },
      });
    }
    if (resource === "documentCategory") {
      await this.requireDocumentCategory(id);
      return this.db.documentCategory.update({
        where: { id },
        data: {
          ...audit,
          ...(input.description !== undefined && {
            description: input.description.trim() || null,
          }),
        },
      });
    }
    await this.requireOrganizationRelationshipType(id);
    return this.db.organizationRelationshipType.update({
      where: { id },
      data: {
        ...audit,
        ...(input.description !== undefined && {
          description: input.description.trim() || null,
        }),
      },
    });
  }
  async setActive(resource: Resource, id: string, isActive: boolean) {
    const name =
      resource === "tag"
        ? (await this.requireTag(id)).name
        : resource === "caseType"
          ? (await this.requireCaseType(id)).name
          : resource === "practiceArea"
            ? (await this.requirePracticeArea(id)).name
            : resource === "matterStage"
              ? (await this.requireMatterStage(id)).name
              : resource === "participantRole"
                ? (await this.requireParticipantRole(id)).name
                : resource === "proceedingType"
                  ? (await this.requireProceedingType(id)).name
                  : resource === "documentCategory"
                    ? (await this.requireDocumentCategory(id)).name
                    : (await this.requireOrganizationRelationshipType(id)).name;
    return this.update(resource, id, { name, isActive });
  }
  private validateName(input: ReferenceDto) {
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException("Name is required");
  }
  private async requireTag(id: string) {
    const item = await this.db.tag.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requireCaseType(id: string) {
    const item = await this.db.caseType.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requirePracticeArea(id: string) {
    const item = await this.db.practiceArea.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requireMatterStage(id: string) {
    const item = await this.db.matterStage.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requireParticipantRole(id: string) {
    const item = await this.db.participantRole.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requireProceedingType(id: string) {
    const item = await this.db.proceedingType.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requireDocumentCategory(id: string) {
    const item = await this.db.documentCategory.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
  private async requireOrganizationRelationshipType(id: string) {
    const item = await this.db.organizationRelationshipType.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new BadRequestException("Reference data not found");
    return item;
  }
}
