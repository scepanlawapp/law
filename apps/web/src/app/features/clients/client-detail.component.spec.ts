import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { of, Subject, throwError } from "rxjs";
import {
  ClientAddress,
  ClientContact,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { ClientDetail } from "@law/api-interfaces";
import { ClientDetailComponent } from "./client-detail.component";
import { ClientFormDialogService } from "./client-create-edit-modal/client-form-dialog.service";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";

describe("Client detail actions", () => {
  const address = {
    id: "address",
    street: "Street",
    city: "City",
    postalCode: "11000",
    country: "RS",
    addressType: "OFFICE",
    isPrimary: false,
  } as ClientAddress;
  const contact = {
    id: "contact",
    status: "ACTIVE",
    isPrimary: false,
  } as ClientContact;
  const client = {
    id: "client",
    type: "ORGANIZATION",
    organizationName: "Company",
    displayName: "Company",
    email: "old@test.rs",
    tags: [],
  } as unknown as ClientDetail;
  const api = {
    get: jest.fn(),
    listAddresses: jest.fn(),
    listContacts: jest.fn(),
    listIdentificationDocuments: jest.fn(),
    updateAddress: jest.fn(),
    updateContact: jest.fn(),
    removeAddress: jest.fn(),
    deactivateContact: jest.fn(),
  };
  const dialog = { edit: jest.fn() };
  const confirmation = { confirm: jest.fn() };
  let component: ClientDetailComponent;
  beforeEach(() => {
    jest.resetAllMocks();
    api.get.mockReturnValue(of(client));
    api.listAddresses.mockReturnValue(of([address]));
    api.listContacts.mockReturnValue(of([contact]));
    api.listIdentificationDocuments.mockReturnValue(of([]));
    for (const method of [
      api.updateAddress,
      api.updateContact,
      api.removeAddress,
      api.deactivateContact,
    ])
      method.mockReturnValue(of({}));
    dialog.edit.mockReturnValue(of(undefined));
    confirmation.confirm.mockReturnValue(of(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: ClientsApiClient, useValue: api },
        { provide: ReferencesApiClient, useValue: { users: () => of([]) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ clientId: "client" }),
              queryParamMap: convertToParamMap({}),
            },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: LocalizationService,
          useValue: { language: () => "EN", translate: (key: string) => key },
        },
        { provide: ClientFormDialogService, useValue: dialog },
        { provide: ConfirmDialogService, useValue: confirmation },
      ],
    });
    component = TestBed.runInInjectionContext(
      () => new ClientDetailComponent(),
    );
  });
  it.each([
    "basic",
    "addresses",
    "contacts",
    "identification",
    "additional",
  ] as const)("routes edit to %s", (tab) => {
    component.editClient(tab);
    expect(dialog.edit).toHaveBeenCalledWith("client", tab);
  });
  it("persists primary contact and refreshes mirrored summary channels", () => {
    api.get.mockReturnValue(of({ ...client, email: "new@test.rs" }));
    component.setPrimaryContact(contact.id);
    expect(api.updateContact).toHaveBeenCalledWith("client", contact.id, {
      isPrimary: true,
    });
    expect(component.client()?.email).toBe("new@test.rs");
  });
  it("preserves address attributes when updating primary or supported type", () => {
    component.updateAddress(address.id, {
      isPrimary: true,
      addressType: "BILLING",
    });
    const { id, ...fields } = address;
    expect(api.updateAddress).toHaveBeenCalledWith(
      "client",
      id,
      expect.objectContaining({
        ...fields,
        isPrimary: true,
        addressType: "BILLING",
      }),
    );
    expect(api.updateAddress.mock.calls[0][2]).not.toHaveProperty("id");
  });
  it.each(["address", "contact"] as const)(
    "blocks primary %s deletion before confirmation",
    (kind) => {
      component.addresses.set([{ ...address, isPrimary: true }]);
      component.contacts.set([{ ...contact, isPrimary: true }]);
      component.deleteRecord(kind, kind);
      expect(confirmation.confirm).not.toHaveBeenCalled();
      expect(api.removeAddress).not.toHaveBeenCalled();
      expect(api.deactivateContact).not.toHaveBeenCalled();
    },
  );
  it("rechecks primary state after confirmation", () => {
    const answer = new Subject<boolean>();
    confirmation.confirm.mockReturnValue(answer);
    component.deleteRecord("address", address.id);
    component.addresses.set([{ ...address, isPrimary: true }]);
    answer.next(true);
    expect(api.removeAddress).not.toHaveBeenCalled();
  });
  it("requires confirmation and hides soft-deleted contacts after refresh", () => {
    confirmation.confirm.mockReturnValueOnce(of(false));
    component.deleteRecord("contact", contact.id);
    expect(api.deactivateContact).not.toHaveBeenCalled();
    api.listContacts.mockReturnValue(of([{ ...contact, status: "INACTIVE" }]));
    component.deleteRecord("contact", contact.id);
    expect(api.deactivateContact).toHaveBeenCalledWith("client", contact.id);
    expect(component.sortedContacts()).toEqual([]);
  });
  it("deletes confirmed secondary addresses and refreshes the list", () => {
    api.listAddresses.mockReturnValue(of([]));
    component.deleteRecord("address", address.id);
    expect(api.removeAddress).toHaveBeenCalledWith("client", address.id);
    expect(component.addresses()).toEqual([]);
  });
  it("blocks duplicate operations through persistence and refresh", () => {
    const result = new Subject<unknown>();
    const refresh = new Subject<ClientDetail>();
    api.updateContact.mockReturnValue(result);
    api.get.mockReturnValue(refresh);
    component.setPrimaryContact(contact.id);
    component.setPrimaryContact(contact.id);
    expect(api.updateContact).toHaveBeenCalledTimes(1);
    result.next({});
    result.complete();
    expect(component.pending()).toBe(contact.id);
    refresh.next(client);
    refresh.complete();
    expect(component.pending()).toBeNull();
  });
  it("retains visible data and releases pending state on errors", () => {
    api.updateAddress.mockReturnValue(throwError(() => new Error("Failed")));
    component.updateAddress(address.id, { isPrimary: true });
    expect(component.mutationError()).toBe(true);
    expect(component.pending()).toBeNull();
    expect(component.addresses()).toEqual([address]);
  });
});
