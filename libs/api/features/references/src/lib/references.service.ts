import { Injectable } from "@nestjs/common";
import { PlatformPrismaService, TenantContextService } from "@law/core";

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
  async userSearch(search: string, limit = 20) {
    const normalized = search.trim();
    const members = await this.platformPrisma.workspaceMember.findMany({
      where: {
        workspaceId: this.context.workspaceId,
        status: "ACTIVE",
        ...(normalized
          ? {
              user: {
                OR: [
                  { email: { contains: normalized, mode: "insensitive" } },
                  { firstName: { contains: normalized, mode: "insensitive" } },
                  { lastName: { contains: normalized, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      take: limit,
      select: {
        userId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { user: { email: "asc" } },
    });
    return members.map((member) => ({
      id: member.userId,
      displayName:
        [member.user.firstName, member.user.lastName]
          .filter(Boolean)
          .join(" ") || member.user.email,
      secondaryText: member.user.email,
    }));
  }
  countries() {
    return countries;
  }
}
