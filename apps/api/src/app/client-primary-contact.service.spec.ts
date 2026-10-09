import { BadRequestException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { ClientsService } from "@law/clients";
const workspaceId = "workspace",
  userId = "user",
  clientId = "client";
const primary = {
  id: "primary",
  clientId,
  status: "ACTIVE",
  isPrimary: true,
  firstName: "",
  lastName: "",
  email: "old@test.rs",
  phone: "123",
  position: null,
  notes: null,
};
describe("Client primary contact synchronization", () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    client: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    domainCounter: { upsert: jest.fn() },
    clientContact: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    clientActivity: { create: jest.fn() },
    clientAddress: { findFirst: jest.fn(), delete: jest.fn() },
  };
  const service = new ClientsService(db as never, {} as never);
  const run = <T>(fn: () => Promise<T>) =>
    WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.OWNER },
      fn,
    );
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.client.findFirst.mockResolvedValue({
      id: clientId,
      type: "INDIVIDUAL",
      firstName: "Ana",
      lastName: "Test",
      email: "old@test.rs",
      phone: "123",
    });
    db.client.create.mockResolvedValue({ id: clientId });
    db.domainCounter.upsert.mockResolvedValue({ value: 1 });
    db.clientContact.findFirst.mockResolvedValue(primary);
    db.clientContact.create.mockResolvedValue(primary);
    db.clientContact.update.mockResolvedValue(primary);
    jest.spyOn(service, "get").mockResolvedValue({ id: clientId } as never);
  });
  it("creates channel-only primary contact atomically with a client and mirrors the summary", async () => {
    await run(() =>
      service.create({
        type: "ORGANIZATION",
        organizationName: "Company",
        primaryContact: { email: " office@test.rs ", phone: "123" },
      }),
    );
    expect(db.clientContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId,
        firstName: "",
        lastName: "",
        email: "office@test.rs",
        isPrimary: true,
      }),
    });
    expect(db.client.update).toHaveBeenCalledWith({
      where: { id: clientId, workspaceId },
      data: { email: "office@test.rs", phone: "123" },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it("clears existing primary channels without creating another contact", async () => {
    await run(() =>
      service.update(clientId, {
        type: "INDIVIDUAL",
        primaryContact: { id: primary.id, email: "", phone: "" },
      }),
    );
    expect(db.clientContact.update).toHaveBeenCalledWith({
      where: { id: primary.id },
      data: expect.objectContaining({
        email: null,
        phone: null,
        isPrimary: true,
      }),
    });
    expect(db.clientContact.create).not.toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalled();
  });
  it("creates a distinct new primary without overwriting the former primary", async () => {
    await run(() =>
      service.update(clientId, {
        type: "INDIVIDUAL",
        primaryContact: { email: "new@test.rs" },
      }),
    );
    expect(db.clientContact.create).toHaveBeenCalled();
    expect(db.clientContact.update).not.toHaveBeenCalled();
    expect(db.clientContact.updateMany).toHaveBeenCalledWith({
      where: { clientId, isPrimary: true },
      data: { isPrimary: false },
    });
  });
  it("rejects primary contacts from another client or inactive contacts", async () => {
    db.clientContact.findFirst.mockResolvedValue(null);
    await expect(
      run(() =>
        service.update(clientId, {
          type: "INDIVIDUAL",
          primaryContact: { id: "foreign", email: "x@test.rs" },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.clientContact.create).not.toHaveBeenCalled();
    expect(db.clientContact.findFirst).toHaveBeenCalledWith({
      where: { clientId, id: "foreign", status: "ACTIVE" },
    });
  });
  it("keeps compatibility email updates on the existing primary", async () => {
    await run(() =>
      service.update(clientId, { type: "INDIVIDUAL", email: "new@test.rs" }),
    );
    expect(db.clientContact.update).toHaveBeenCalledWith({
      where: { id: primary.id },
      data: expect.objectContaining({ email: "new@test.rs", phone: "123" }),
    });
  });
  it("mirrors primary contact edits made through the Contacts API", async () => {
    db.clientContact.findFirst
      .mockResolvedValueOnce(primary)
      .mockResolvedValueOnce({ ...primary, email: "changed@test.rs" });
    await run(() =>
      service.updateContact(clientId, primary.id, { email: "changed@test.rs" }),
    );
    expect(db.client.update).toHaveBeenCalledWith({
      where: { id: clientId, workspaceId },
      data: expect.objectContaining({ email: "changed@test.rs" }),
    });
  });
  it("rejects primary contact deletion without changing its channels", async () => {
    await expect(
      run(() => service.deactivateContact(clientId, primary.id)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.clientContact.update).not.toHaveBeenCalled();
    expect(db.client.update).not.toHaveBeenCalled();
  });
  it("deactivates a secondary contact scoped to its client", async () => {
    db.clientContact.findFirst.mockResolvedValue({
      ...primary,
      isPrimary: false,
    });
    await run(() => service.deactivateContact(clientId, "secondary"));
    expect(db.clientContact.findFirst).toHaveBeenCalledWith({
      where: { id: "secondary", clientId },
    });
    expect(db.clientContact.update).toHaveBeenCalledWith({
      where: { id: "secondary" },
      data: { status: "INACTIVE", isPrimary: false },
    });
  });
  it("rejects primary address deletion", async () => {
    db.clientAddress.findFirst.mockResolvedValue({
      id: "address",
      isPrimary: true,
    });
    await expect(
      run(() => service.removeAddress(clientId, "address")),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.clientAddress.delete).not.toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalled();
  });
  it("deletes secondary addresses scoped to their client", async () => {
    db.clientAddress.findFirst.mockResolvedValue({
      id: "address",
      isPrimary: false,
    });
    await run(() => service.removeAddress(clientId, "address"));
    expect(db.clientAddress.findFirst).toHaveBeenCalledWith({
      where: { id: "address", clientId },
    });
    expect(db.clientAddress.delete).toHaveBeenCalledWith({
      where: { id: "address" },
    });
  });
});
