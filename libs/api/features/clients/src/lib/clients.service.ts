import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Client,
  Prisma,
  PrismaClient as TenantPrismaClient,
} from "@prisma/tenant-client";
import {
  PlatformPrismaService,
  paginationMeta,
  parseSort,
  TenantContextService,
} from "@law/core";
import {
  ClientDetail,
  ClientListResponse,
  ClientSummary,
} from "@law/api-interfaces";
import {
  ClientActivityDto,
  ClientActivityListQueryDto,
  ClientAddressDto,
  ClientCaseListQueryDto,
  ClientContactDto,
  ClientListQueryDto,
  CreateClientDto,
  UpdateClientActivityDto,
  UpdateClientContactDto,
  UpdateClientDto,
} from "./clients.dto";

@Injectable()
export class ClientsService {
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

  private async requireTags(tagIds: string[] | undefined): Promise<void> {
    if (!tagIds?.length) return;
    const count = await this.db.tag.count({
      where: {
        id: { in: tagIds },
        workspaceId: this.context.workspaceId,
        isActive: true,
      },
    });
    if (count !== new Set(tagIds).size)
      throw new BadRequestException("One or more tags are unavailable");
  }

  private normalize(
    input: CreateClientDto | UpdateClientDto,
    existing?: Client,
  ) {
    const type = input.type ?? existing?.type;
    const firstName = input.firstName?.trim() ?? existing?.firstName ?? null;
    const lastName = input.lastName?.trim() ?? existing?.lastName ?? null;
    const organizationName =
      input.organizationName?.trim() ?? existing?.organizationName ?? null;
    const suppliedDisplayName = input.displayName?.trim();
    const displayName =
      type === "ORGANIZATION"
        ? organizationName
        : suppliedDisplayName ||
          [firstName, lastName].filter(Boolean).join(" ");
    if (
      !type ||
      !displayName ||
      (type === "ORGANIZATION" && !organizationName)
    ) {
      throw new BadRequestException(
        type === "ORGANIZATION"
          ? "Organization name is required"
          : "Individual first and last name or display name is required",
      );
    }
    return { type, firstName, lastName, organizationName, displayName };
  }

  private customFields(
    value: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return value as Prisma.InputJsonValue;
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    name: "CLIENT" | "CASE",
  ): Promise<string> {
    const workspaceId = this.context.workspaceId;
    const counter = await tx.domainCounter.upsert({
      where: { workspaceId_name: { workspaceId, name } },
      create: { workspaceId, name, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return `${name === "CLIENT" ? "CL" : "CA"}-${String(counter.value).padStart(6, "0")}`;
  }

  private toSummary(
    client: Client & { _count: { cases: number } },
  ): ClientSummary {
    return {
      ...client,
      email: client.email ?? null,
      phone: client.phone ?? null,
      responsibleUserId: client.responsibleUserId ?? null,
      activeCaseCount: client._count.cases,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    };
  }

  async list(query: ClientListQueryDto): Promise<ClientListResponse> {
    const { workspaceId } = this.context;
    const page = query.page;
    const pageSize = query.pageSize;
    const sort = parseSort(
      query.sort,
      ["clientNumber", "displayName", "createdAt", "updatedAt", "status"],
      [{ field: "updatedAt", direction: "desc" }],
    );
    const search = query.search?.trim();
    const where: Prisma.ClientWhereInput = {
      workspaceId,
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.responsibleUserId && {
        responsibleUserId: query.responsibleUserId,
      }),
      ...(query.tags?.length && {
        tags: { some: { tagId: { in: query.tags } } },
      }),
      ...(search && {
        OR: [
          "clientNumber",
          "displayName",
          "firstName",
          "lastName",
          "organizationName",
          "email",
          "phone",
        ].map((field) => ({
          [field]: { contains: search, mode: "insensitive" },
        })),
      }),
    };
    const [totalItems, clients] = await this.db.$transaction([
      this.db.client.count({ where }),
      this.db.client.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: sort.map(({ field, direction }) => ({ [field]: direction })),
        include: {
          _count: {
            select: {
              cases: {
                where: { status: { in: ["DRAFT", "ACTIVE", "ON_HOLD"] } },
              },
            },
          },
        },
      }),
    ]);
    return {
      items: clients.map((client) => this.toSummary(client)),
      meta: paginationMeta(page, pageSize, totalItems, sort),
    };
  }

  async get(clientId: string): Promise<ClientDetail> {
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.context.workspaceId },
      include: {
        tags: { include: { tag: true } },
        _count: {
          select: {
            cases: {
              where: { status: { in: ["DRAFT", "ACTIVE", "ON_HOLD"] } },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException("Client not found");
    return {
      ...this.toSummary(client),
      firstName: client.firstName,
      lastName: client.lastName,
      organizationName: client.organizationName,
      website: client.website,
      preferredLanguage: client.preferredLanguage,
      notes: client.notes,
      customFields: client.customFields as Record<string, unknown> | null,
      tags: client.tags.map(({ tag }) => ({
        id: tag.id,
        name: tag.name,
        isActive: tag.isActive,
      })),
    };
  }

  async create(input: CreateClientDto): Promise<ClientDetail> {
    await this.requireResponsibleUser(input.responsibleUserId);
    await this.requireTags(input.tagIds);
    const normalized = this.normalize(input);
    const { workspaceId, userId } = this.context;
    const client = await this.db.$transaction(async (tx) =>
      tx.client.create({
        data: {
          workspaceId,
          clientNumber: await this.nextNumber(tx, "CLIENT"),
          ...normalized,
          email: input.email?.trim(),
          phone: input.phone?.trim(),
          website: input.website?.trim(),
          preferredLanguage: input.preferredLanguage?.trim(),
          notes: input.notes?.trim(),
          customFields: this.customFields(input.customFields),
          responsibleUserId: input.responsibleUserId,
          createdByUserId: userId,
          updatedByUserId: userId,
          tags: input.tagIds?.length
            ? { create: input.tagIds.map((tagId) => ({ tagId })) }
            : undefined,
          activities: {
            create: {
              workspaceId,
              type: "NOTE",
              title: "Client created",
              activityDate: new Date(),
              source: "SYSTEM",
              createdByUserId: userId,
              updatedByUserId: userId,
            },
          },
        },
      }),
    );
    return this.get(client.id);
  }

  async update(
    clientId: string,
    input: UpdateClientDto,
  ): Promise<ClientDetail> {
    const existing = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.context.workspaceId },
    });
    if (!existing) throw new NotFoundException("Client not found");
    await this.requireResponsibleUser(input.responsibleUserId);
    await this.requireTags(input.tagIds);
    const normalized = this.normalize(input, existing);
    const { userId, workspaceId } = this.context;
    await this.db.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: {
          ...normalized,
          ...(input.email !== undefined && {
            email: input.email.trim() || null,
          }),
          ...(input.phone !== undefined && {
            phone: input.phone.trim() || null,
          }),
          ...(input.website !== undefined && {
            website: input.website.trim() || null,
          }),
          ...(input.preferredLanguage !== undefined && {
            preferredLanguage: input.preferredLanguage.trim() || null,
          }),
          ...(input.notes !== undefined && {
            notes: input.notes.trim() || null,
          }),
          ...(input.customFields !== undefined && {
            customFields: this.customFields(input.customFields),
          }),
          ...(input.responsibleUserId !== undefined && {
            responsibleUserId: input.responsibleUserId,
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
      await tx.clientActivity.create({
        data: {
          workspaceId,
          clientId,
          type: "NOTE",
          title: "Client information updated",
          activityDate: new Date(),
          source: "SYSTEM",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
    });
    return this.get(clientId);
  }

  async archive(clientId: string): Promise<ClientDetail> {
    const { workspaceId, userId } = this.context;
    const client = await this.db.$transaction(async (tx) => {
      const existing = await tx.client.findFirst({
        where: { id: clientId, workspaceId },
      });
      if (!existing) throw new NotFoundException("Client not found");
      const activeCaseCount = await tx.case.count({
        where: {
          clientId,
          workspaceId,
          status: { in: ["DRAFT", "ACTIVE", "ON_HOLD"] },
        },
      });
      if (activeCaseCount)
        throw new BadRequestException(
          "Clients with open cases cannot be archived",
        );
      await tx.clientActivity.create({
        data: {
          workspaceId,
          clientId,
          type: "NOTE",
          title: "Client archived",
          activityDate: new Date(),
          source: "SYSTEM",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      return tx.client.update({
        where: { id: clientId },
        data: { status: "ARCHIVED", updatedByUserId: userId },
      });
    });
    return this.get(client.id);
  }

  async activate(clientId: string): Promise<ClientDetail> {
    const { workspaceId, userId } = this.context;
    const client = await this.db.$transaction(async (tx) => {
      const existing = await tx.client.findFirst({
        where: { id: clientId, workspaceId },
      });
      if (!existing) throw new NotFoundException("Client not found");
      await tx.clientActivity.create({
        data: {
          workspaceId,
          clientId,
          type: "NOTE",
          title: "Client activated",
          activityDate: new Date(),
          source: "SYSTEM",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      return tx.client.update({
        where: { id: clientId },
        data: { status: "ACTIVE", updatedByUserId: userId },
      });
    });
    return this.get(client.id);
  }

  private async requireClient(clientId: string): Promise<Client> {
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.context.workspaceId },
    });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async listAddresses(clientId: string) {
    await this.requireClient(clientId);
    return this.db.clientAddress.findMany({
      where: { clientId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  async listCases(clientId: string, query: ClientCaseListQueryDto) {
    await this.requireClient(clientId);
    const { workspaceId } = this.context;
    const sort = parseSort(
      query.sort,
      ["caseNumber", "name", "status", "priority", "updatedAt", "createdAt"],
      [{ field: "updatedAt", direction: "desc" }],
    );
    const search = query.search?.trim();
    const where: Prisma.CaseWhereInput = {
      workspaceId,
      clientId,
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(search && {
        OR: ["caseNumber", "name", "externalReference"].map((field) => ({
          [field]: { contains: search, mode: "insensitive" },
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
      items: items.map((item) => ({
        ...item,
        openedDate: item.openedDate?.toISOString() ?? null,
        closedDate: item.closedDate?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      meta: paginationMeta(query.page, query.pageSize, totalItems, sort),
    };
  }

  async createAddress(clientId: string, input: ClientAddressDto) {
    await this.requireClient(clientId);
    const { userId } = this.context;
    return this.db.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.clientAddress.updateMany({
          where: { clientId, isPrimary: true },
          data: { isPrimary: false },
        });
      const address = await tx.clientAddress.create({
        data: {
          clientId,
          type: input.type ?? "MAIN",
          street: input.street?.trim(),
          streetAdditional: input.streetAdditional?.trim(),
          city: input.city?.trim(),
          postalCode: input.postalCode?.trim(),
          stateOrRegion: input.stateOrRegion?.trim(),
          country: input.country?.trim(),
          isPrimary: input.isPrimary ?? false,
        },
      });
      if (address.isPrimary)
        await tx.client.update({
          where: { id: clientId },
          data: { primaryAddressId: address.id, updatedByUserId: userId },
        });
      return address;
    });
  }

  async updateAddress(
    clientId: string,
    addressId: string,
    input: ClientAddressDto,
  ) {
    await this.requireClient(clientId);
    const { userId } = this.context;
    return this.db.$transaction(async (tx) => {
      const address = await tx.clientAddress.findFirst({
        where: { id: addressId, clientId },
      });
      if (!address) throw new NotFoundException("Client address not found");
      if (input.isPrimary)
        await tx.clientAddress.updateMany({
          where: { clientId, isPrimary: true, NOT: { id: addressId } },
          data: { isPrimary: false },
        });
      const updated = await tx.clientAddress.update({
        where: { id: addressId },
        data: {
          ...(input.type !== undefined && { type: input.type }),
          ...(input.street !== undefined && {
            street: input.street.trim() || null,
          }),
          ...(input.streetAdditional !== undefined && {
            streetAdditional: input.streetAdditional.trim() || null,
          }),
          ...(input.city !== undefined && { city: input.city.trim() || null }),
          ...(input.postalCode !== undefined && {
            postalCode: input.postalCode.trim() || null,
          }),
          ...(input.stateOrRegion !== undefined && {
            stateOrRegion: input.stateOrRegion.trim() || null,
          }),
          ...(input.country !== undefined && {
            country: input.country.trim() || null,
          }),
          ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
        },
      });
      if (updated.isPrimary)
        await tx.client.update({
          where: { id: clientId },
          data: { primaryAddressId: addressId, updatedByUserId: userId },
        });
      if (input.isPrimary === false && address.isPrimary)
        await tx.client.update({
          where: { id: clientId },
          data: { primaryAddressId: null, updatedByUserId: userId },
        });
      return updated;
    });
  }

  async removeAddress(clientId: string, addressId: string): Promise<void> {
    await this.requireClient(clientId);
    await this.db.$transaction(async (tx) => {
      const address = await tx.clientAddress.findFirst({
        where: { id: addressId, clientId },
      });
      if (!address) throw new NotFoundException("Client address not found");
      if (address.isPrimary)
        await tx.client.update({
          where: { id: clientId },
          data: {
            primaryAddressId: null,
            updatedByUserId: this.context.userId,
          },
        });
      await tx.clientAddress.delete({ where: { id: addressId } });
    });
  }

  async listContacts(clientId: string) {
    await this.requireClient(clientId);
    return this.db.clientContact.findMany({
      where: { clientId },
      orderBy: [{ status: "asc" }, { isPrimary: "desc" }, { lastName: "asc" }],
    });
  }

  async getContact(clientId: string, contactId: string) {
    await this.requireClient(clientId);
    const contact = await this.db.clientContact.findFirst({
      where: { id: contactId, clientId },
    });
    if (!contact) throw new NotFoundException("Client contact not found");
    return contact;
  }

  async createContact(clientId: string, input: ClientContactDto) {
    await this.requireClient(clientId);
    return this.db.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.clientContact.updateMany({
          where: { clientId, status: "ACTIVE", isPrimary: true },
          data: { isPrimary: false },
        });
      return tx.clientContact.create({
        data: {
          clientId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          position: input.position?.trim(),
          email: input.email?.trim(),
          phone: input.phone?.trim(),
          isPrimary: input.isPrimary ?? false,
          notes: input.notes?.trim(),
        },
      });
    });
  }

  async updateContact(
    clientId: string,
    contactId: string,
    input: UpdateClientContactDto,
  ) {
    const existing = await this.getContact(clientId, contactId);
    if (input.isPrimary && existing.status !== "ACTIVE") {
      throw new BadRequestException("Only active contacts can be primary");
    }
    return this.db.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.clientContact.updateMany({
          where: {
            clientId,
            status: "ACTIVE",
            isPrimary: true,
            NOT: { id: contactId },
          },
          data: { isPrimary: false },
        });
      return tx.clientContact.update({
        where: { id: contactId },
        data: {
          ...(input.firstName !== undefined && {
            firstName: input.firstName.trim(),
          }),
          ...(input.lastName !== undefined && {
            lastName: input.lastName.trim(),
          }),
          ...(input.position !== undefined && {
            position: input.position.trim() || null,
          }),
          ...(input.email !== undefined && {
            email: input.email.trim() || null,
          }),
          ...(input.phone !== undefined && {
            phone: input.phone.trim() || null,
          }),
          ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
          ...(input.notes !== undefined && {
            notes: input.notes.trim() || null,
          }),
        },
      });
    });
  }

  async deactivateContact(clientId: string, contactId: string) {
    await this.getContact(clientId, contactId);
    return this.db.clientContact.update({
      where: { id: contactId },
      data: { status: "INACTIVE", isPrimary: false },
    });
  }

  async listActivities(clientId: string, query: ClientActivityListQueryDto) {
    await this.requireClient(clientId);
    const { workspaceId } = this.context;
    const directWhere = {
      clientId,
      workspaceId,
      ...(query.type && { type: query.type }),
      ...(query.from || query.to
        ? {
            activityDate: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };
    const direct = await this.db.clientActivity.findMany({
      where: directWhere,
      orderBy: { activityDate: "desc" },
    });
    const items = query.includeCaseActivities
      ? [
          ...direct.map((item) => ({ ...item, origin: "CLIENT" })),
          ...(
            await this.db.caseActivity.findMany({
              where: {
                workspaceId,
                case: { clientId },
                ...(query.type && { type: query.type }),
                ...(query.from || query.to
                  ? {
                      activityDate: {
                        ...(query.from && { gte: new Date(query.from) }),
                        ...(query.to && { lte: new Date(query.to) }),
                      },
                    }
                  : {}),
              },
              orderBy: { activityDate: "desc" },
            })
          ).map((item) => ({ ...item, origin: "CASE" })),
        ].sort(
          (left, right) =>
            right.activityDate.getTime() - left.activityDate.getTime(),
        )
      : direct.map((item) => ({ ...item, origin: "CLIENT" }));
    const totalItems = items.length;
    return {
      items: items.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      meta: paginationMeta(query.page, query.pageSize, totalItems, [
        { field: "activityDate", direction: "desc" },
      ]),
    };
  }

  async createActivity(clientId: string, input: ClientActivityDto) {
    await this.requireClient(clientId);
    const { workspaceId, userId } = this.context;
    if (input.relatedCaseId) {
      const relatedCase = await this.db.case.findFirst({
        where: { id: input.relatedCaseId, clientId, workspaceId },
      });
      if (!relatedCase)
        throw new BadRequestException(
          "Related case does not belong to this client",
        );
    }
    return this.db.clientActivity.create({
      data: {
        workspaceId,
        clientId,
        relatedCaseId: input.relatedCaseId,
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
    clientId: string,
    activityId: string,
    input: UpdateClientActivityDto,
  ) {
    await this.requireClient(clientId);
    const activity = await this.db.clientActivity.findFirst({
      where: {
        id: activityId,
        clientId,
        workspaceId: this.context.workspaceId,
      },
    });
    if (!activity) throw new NotFoundException("Client activity not found");
    if (activity.source !== "MANUAL")
      throw new BadRequestException("System activities cannot be edited");
    if (input.relatedCaseId) {
      const relatedCase = await this.db.case.findFirst({
        where: {
          id: input.relatedCaseId,
          clientId,
          workspaceId: this.context.workspaceId,
        },
      });
      if (!relatedCase)
        throw new BadRequestException(
          "Related case does not belong to this client",
        );
    }
    return this.db.clientActivity.update({
      where: { id: activityId },
      data: {
        ...(input.relatedCaseId !== undefined && {
          relatedCaseId: input.relatedCaseId,
        }),
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
}
