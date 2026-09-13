import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PlatformPrismaService, TenantContextService } from "@law/core";
import { PrismaClient as TenantPrismaClient } from "@prisma/tenant-client";
import { ReferenceDto } from "./references.dto";

type Resource = "tag" | "caseType" | "practiceArea";
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
    return resource === "tag"
      ? this.db.tag.findMany({
          where: { workspaceId: this.context.workspaceId },
          orderBy: { name: "asc" },
        })
      : resource === "caseType"
        ? this.db.caseType.findMany({
            where: { workspaceId: this.context.workspaceId },
            orderBy: { name: "asc" },
          })
        : this.db.practiceArea.findMany({
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
    return resource === "tag"
      ? this.db.tag.create({ data: { ...audit, color: input.color?.trim() } })
      : resource === "caseType"
        ? this.db.caseType.create({
            data: { ...audit, description: input.description?.trim() },
          })
        : this.db.practiceArea.create({
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
  async setActive(resource: Resource, id: string, isActive: boolean) {
    return this.update(resource, id, {
      name:
        resource === "tag"
          ? (await this.requireTag(id)).name
          : resource === "caseType"
            ? (await this.requireCaseType(id)).name
            : (await this.requirePracticeArea(id)).name,
      isActive,
    });
  }
  private validateName(input: ReferenceDto) {
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException("Name is required");
  }
  private async requireTag(id: string) {
    const item = await this.db.tag.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Reference data not found");
    return item;
  }
  private async requireCaseType(id: string) {
    const item = await this.db.caseType.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Reference data not found");
    return item;
  }
  private async requirePracticeArea(id: string) {
    const item = await this.db.practiceArea.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Reference data not found");
    return item;
  }
}
