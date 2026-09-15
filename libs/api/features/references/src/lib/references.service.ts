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
  countries() {
    return countries;
  }
}
