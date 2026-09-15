import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  LegalClientDetail,
  LegalClientListResponse,
  LegalClientSummary,
  CreateClientRequest,
  CreateOrganizationContactRequest,
  LegalLookupSummary,
  OrganizationContactResponse,
  PartyDetail,
  PartySummary,
  UpdateClientRequest,
} from "@law/api-interfaces";
import {
  paginationMeta,
  parseSort,
  PlatformPrismaService,
  TenantContextService,
  PaginationQueryDto,
} from "@law/core";
import {
  Prisma,
  PrismaClient as TenantPrismaClient,
} from "@prisma/tenant-client";

interface LookupRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

interface PartyRecord {
  id: string;
  type: "PERSON" | "ORGANIZATION";
  displayName: string;
  legalName: string | null;
  tradeName: string | null;
  firstName: string | null;
  lastName: string | null;
  notes: string | null;
  contactPoints: ContactRecord[];
  identifiers: IdentifierRecord[];
  addresses: AddressRecord[];
  outgoingRelations: PartyRelationRecord[];
}

interface ContactRecord {
  id: string;
  type: "EMAIL" | "PHONE" | "MOBILE" | "FAX" | "WEBSITE" | "OTHER";
  value: string;
  label: string | null;
  isPrimary: boolean;
}

interface IdentifierRecord {
  id: string;
  type:
    | "NATIONAL_ID"
    | "TAX_ID"
    | "REGISTRATION_ID"
    | "PASSPORT"
    | "ID_CARD"
    | "VAT_ID"
    | "OTHER";
  value: string;
  countryCode: string | null;
  issuer: string | null;
  isPrimary: boolean;
}

interface AddressRecord {
  id: string;
  type: "PRIMARY" | "REGISTERED" | "MAILING" | "BILLING" | "OTHER";
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  countryCode: string | null;
  isPrimary: boolean;
}

interface PartyRelationRecord {
  id: string;
  jobTitle: string | null;
  department: string | null;
  isPrimaryContact: boolean;
  isActive: boolean;
  relationshipType: LookupRecord;
  toParty: OrganizationPartyRecord;
}

interface OrganizationPartyRecord {
  id: string;
  type: "PERSON" | "ORGANIZATION";
  displayName: string;
  legalName: string | null;
  tradeName: string | null;
  contactPoints: ContactRecord[];
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

@Injectable()
export class ClientsService {
  constructor(private readonly platformPrisma: PlatformPrismaService) {}

  private get db(): TenantPrismaClient {
    return TenantContextService.required.prisma;
  }

  private get workspaceId(): string {
    return TenantContextService.required.workspaceId;
  }

  async list(
    query: PaginationQueryDto & { status?: string },
  ): Promise<LegalClientListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = parseSort(
      query.sort,
      ["clientCode", "createdAt", "updatedAt", "status"],
      [{ field: "createdAt", direction: "desc" }],
    );
    const search = query.search?.trim();
    const where: Prisma.ClientWhereInput = {
      workspaceId: this.workspaceId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(search
        ? {
            OR: [
              { clientCode: { contains: search, mode: "insensitive" } },
              {
                party: {
                  OR: [
                    { displayName: { contains: search, mode: "insensitive" } },
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { legalName: { contains: search, mode: "insensitive" } },
                    { tradeName: { contains: search, mode: "insensitive" } },
                    {
                      contactPoints: {
                        some: {
                          value: { contains: search, mode: "insensitive" },
                        },
                      },
                    },
                    {
                      identifiers: {
                        some: {
                          value: { contains: search, mode: "insensitive" },
                        },
                      },
                    },
                    {
                      outgoingRelations: {
                        some: {
                          workspaceId: this.workspaceId,
                          isActive: true,
                          toParty: {
                            OR: [
                              {
                                displayName: {
                                  contains: search,
                                  mode: "insensitive",
                                },
                              },
                              {
                                firstName: {
                                  contains: search,
                                  mode: "insensitive",
                                },
                              },
                              {
                                lastName: {
                                  contains: search,
                                  mode: "insensitive",
                                },
                              },
                              {
                                contactPoints: {
                                  some: {
                                    value: {
                                      contains: search,
                                      mode: "insensitive",
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    };
    const orderBy = sort.map((item) => ({ [item.field]: item.direction }));
    const [items, totalItems] = await Promise.all([
      this.db.client.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { party: true },
      }),
      this.db.client.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toSummary(item)),
      meta: paginationMeta(page, pageSize, totalItems, sort),
    };
  }

  async get(clientId: string): Promise<LegalClientDetail> {
    const client = await this.requireClient(clientId, true);
    return this.toDetail(client);
  }

  async create(input: CreateClientRequest): Promise<LegalClientDetail> {
    this.validatePartyInput(input);
    await this.validateResponsibleUser(input.responsibleUserId);
    const now = new Date();
    const client = await this.db.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          workspaceId: this.workspaceId,
          type: input.type,
          firstName: input.firstName,
          lastName: input.lastName,
          legalName: input.legalName,
          tradeName: input.tradeName,
          displayName: this.displayName(input),
          notes: input.notes,
          createdByUserId: TenantContextService.required.userId,
          updatedByUserId: TenantContextService.required.userId,
          contactPoints: input.contactPoints?.length
            ? { create: input.contactPoints }
            : undefined,
          identifiers: input.identifiers?.length
            ? { create: input.identifiers }
            : undefined,
          addresses: input.addresses?.length
            ? { create: input.addresses }
            : undefined,
        },
      });
      return tx.client.create({
        data: {
          workspaceId: this.workspaceId,
          partyId: party.id,
          clientCode: this.clientCode(now),
          responsibleUserId: input.responsibleUserId,
          notes: input.notes,
          createdByUserId: TenantContextService.required.userId,
          updatedByUserId: TenantContextService.required.userId,
        },
        include: { party: { include: this.partyInclude() } },
      });
    });
    return this.toDetail(client);
  }

  async update(
    clientId: string,
    input: UpdateClientRequest,
  ): Promise<LegalClientDetail> {
    await this.requireClient(clientId);
    await this.validateResponsibleUser(input.responsibleUserId ?? undefined);
    const client = await this.db.$transaction(async (tx) => {
      const current = await tx.client.findFirstOrThrow({
        where: { id: clientId, workspaceId: this.workspaceId },
        include: { party: true },
      });
      const partyData = {
        firstName: input.firstName,
        lastName: input.lastName,
        legalName: input.legalName,
        tradeName: input.tradeName,
        notes: input.notes,
        displayName: this.displayName({
          type: current.party.type,
          firstName: input.firstName ?? current.party.firstName ?? undefined,
          lastName: input.lastName ?? current.party.lastName ?? undefined,
          legalName: input.legalName ?? current.party.legalName ?? undefined,
          tradeName: input.tradeName ?? current.party.tradeName ?? undefined,
        }),
        updatedByUserId: TenantContextService.required.userId,
      };
      await tx.party.update({
        where: { id: current.partyId },
        data: partyData,
      });
      return tx.client.update({
        where: { id: clientId },
        data: {
          responsibleUserId: input.responsibleUserId,
          status: input.status,
          notes: input.notes,
          updatedByUserId: TenantContextService.required.userId,
        },
        include: { party: { include: this.partyInclude() } },
      });
    });
    return this.toDetail(client);
  }

  async archive(clientId: string): Promise<LegalClientDetail> {
    const client = await this.requireClient(clientId);
    const updated = await this.db.client.update({
      where: { id: client.id },
      data: {
        status: "INACTIVE",
        archivedAt: new Date(),
        updatedByUserId: TenantContextService.required.userId,
      },
      include: { party: { include: this.partyInclude() } },
    });
    return this.toDetail(updated);
  }

  async activate(clientId: string): Promise<LegalClientDetail> {
    const client = await this.requireClient(clientId);
    const updated = await this.db.client.update({
      where: { id: client.id },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        updatedByUserId: TenantContextService.required.userId,
      },
      include: { party: { include: this.partyInclude() } },
    });
    return this.toDetail(updated);
  }

  async addOrganizationContact(
    clientId: string,
    input: CreateOrganizationContactRequest,
  ): Promise<OrganizationContactResponse> {
    const client = await this.requireClient(clientId);
    if (client.party.type !== "ORGANIZATION") {
      throw new BadRequestException(
        "Only organization clients can have contacts",
      );
    }
    const relationshipType =
      await this.db.organizationRelationshipType.findFirst({
        where: { id: input.relationshipTypeId, workspaceId: this.workspaceId },
      });
    if (!relationshipType)
      throw new NotFoundException("Relationship type not found");

    const contact = await this.db.$transaction(async (tx) => {
      let partyId = input.existingPartyId;
      if (partyId) {
        const existing = await tx.party.findFirst({
          where: { id: partyId, workspaceId: this.workspaceId, type: "PERSON" },
        });
        if (!existing) throw new NotFoundException("Person party not found");
      } else {
        if (!input.firstName?.trim() || !input.lastName?.trim()) {
          throw new BadRequestException(
            "First name and last name are required",
          );
        }
        const party = await tx.party.create({
          data: {
            workspaceId: this.workspaceId,
            type: "PERSON",
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            displayName: `${input.firstName.trim()} ${input.lastName.trim()}`,
            createdByUserId: TenantContextService.required.userId,
            updatedByUserId: TenantContextService.required.userId,
            contactPoints: input.contactPoints?.length
              ? { create: input.contactPoints }
              : undefined,
          },
        });
        partyId = party.id;
      }
      const relation = await tx.partyRelationship.create({
        data: {
          workspaceId: this.workspaceId,
          fromPartyId: client.partyId,
          toPartyId: partyId,
          relationshipTypeId: relationshipType.id,
          jobTitle: input.jobTitle,
          department: input.department,
          isPrimaryContact: input.isPrimaryContact ?? false,
        },
        include: {
          relationshipType: true,
          toParty: { include: { contactPoints: true } },
        },
      });
      return relation;
    });
    return this.toOrganizationContact(contact);
  }

  async autocomplete(
    search: string,
    limit = 20,
  ): Promise<LegalClientSummary[]> {
    const result = await this.list({ page: 1, pageSize: limit, search });
    return result.items;
  }

  private async requireClient(clientId: string, detailed = false) {
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.workspaceId },
      include: {
        party: { include: detailed ? this.partyInclude() : undefined },
      },
    });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  private async validateResponsibleUser(userId?: string | null): Promise<void> {
    if (!userId) return;
    const membership = await this.platformPrisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: this.workspaceId } },
      select: { status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new BadRequestException(
        "Responsible user is not an active workspace member",
      );
    }
  }

  private validatePartyInput(input: CreateClientRequest): void {
    if (
      input.type === "PERSON" &&
      (!input.firstName?.trim() || !input.lastName?.trim())
    ) {
      throw new BadRequestException("First name and last name are required");
    }
    if (input.type === "ORGANIZATION" && !input.legalName?.trim()) {
      throw new BadRequestException("Legal name is required");
    }
  }

  private clientCode(date: Date): string {
    return `CL-${date.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private displayName(input: {
    type: "PERSON" | "ORGANIZATION";
    firstName?: string;
    lastName?: string;
    legalName?: string;
    tradeName?: string;
  }): string {
    if (input.type === "PERSON")
      return `${input.firstName?.trim() ?? ""} ${input.lastName?.trim() ?? ""}`.trim();
    return input.legalName?.trim() || input.tradeName?.trim() || "";
  }

  private partyInclude() {
    return {
      contactPoints: true,
      identifiers: true,
      addresses: true,
      outgoingRelations: {
        where: { workspaceId: this.workspaceId, isActive: true },
        include: {
          relationshipType: true,
          toParty: { include: { contactPoints: true } },
        },
      },
    } as const;
  }

  private toSummary(value: unknown): LegalClientSummary {
    const client = value as ClientRecord;
    return {
      id: client.id,
      clientCode: client.clientCode,
      status: client.status,
      party: this.partySummary(client.party),
      responsibleUserId: client.responsibleUserId,
      openedAt: client.openedAt.toISOString(),
      archivedAt: client.archivedAt?.toISOString() ?? null,
    };
  }

  private toDetail(value: unknown): LegalClientDetail {
    const client = value as ClientRecord;
    return {
      ...this.toSummary(client),
      party: this.partyDetail(client.party),
      organizationContacts: (client.party.outgoingRelations ?? []).map(
        (relation) => this.toOrganizationContact(relation),
      ),
    };
  }

  private partySummary(
    party: PartyRecord | OrganizationPartyRecord,
  ): PartySummary {
    return {
      id: party.id,
      type: party.type,
      displayName: party.displayName,
      secondaryText: party.legalName ?? party.tradeName ?? null,
    };
  }

  private partyDetail(party: PartyRecord): PartyDetail {
    return {
      ...this.partySummary(party),
      firstName: party.firstName,
      lastName: party.lastName,
      legalName: party.legalName,
      tradeName: party.tradeName,
      notes: party.notes,
      contactPoints: party.contactPoints ?? [],
      identifiers: party.identifiers ?? [],
      addresses: party.addresses ?? [],
    };
  }

  private toOrganizationContact(
    relation: PartyRelationRecord,
  ): OrganizationContactResponse {
    return {
      ...this.partySummary(relation.toParty),
      relationshipId: relation.id,
      relationshipType: this.lookupSummary(relation.relationshipType),
      jobTitle: relation.jobTitle,
      department: relation.department,
      isPrimaryContact: relation.isPrimaryContact,
      isActive: relation.isActive,
      contactPoints: relation.toParty.contactPoints ?? [],
    };
  }

  private lookupSummary(value: LookupRecord): LegalLookupSummary {
    return {
      id: value.id,
      code: value.code,
      name: value.name,
      isActive: value.isActive,
      sortOrder: value.sortOrder,
    };
  }
}
