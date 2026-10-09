import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import {
  AuthApiClient,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { ClientFormComponent } from "./client-form.component";
import { ClientFormDialogContext } from "./client-form-dialog.models";

let context: ClientFormDialogContext = {};
jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => context,
}));
const client = {
  id: "client-1",
  type: "INDIVIDUAL",
  status: "ACTIVE",
  firstName: "Ana",
  lastName: "Test",
  email: "legacy@test.rs",
  phone: "111",
  tags: [],
  responsibleUser: null,
};
const contact = (id: string, primary = false) => ({
  id,
  firstName: "Ana",
  lastName: "Test",
  email: `${id}@test.rs`,
  phone: id,
  isPrimary: primary,
  status: "ACTIVE",
});
describe("ClientFormComponent primary contact", () => {
  const api = {
    get: jest.fn(),
    listAddresses: jest.fn(),
    listIdentificationDocuments: jest.fn(),
    listContacts: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createContact: jest.fn(),
    updateContact: jest.fn(),
    deactivateContact: jest.fn(),
  };
  const close = jest.fn();
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
  });
  beforeEach(() => {
    jest.resetAllMocks();
    context = {};
    api.get.mockReturnValue(of(client));
    api.listAddresses.mockReturnValue(of([]));
    api.listIdentificationDocuments.mockReturnValue(of([]));
    api.listContacts.mockReturnValue(of([]));
    api.create.mockReturnValue(of(client));
    api.update.mockReturnValue(of(client));
    api.createContact.mockReturnValue(of(contact("new")));
    api.updateContact.mockReturnValue(of(contact("other")));
    api.deactivateContact.mockReturnValue(of({}));
    TestBed.configureTestingModule({
      providers: [
        { provide: ClientsApiClient, useValue: api },
        {
          provide: AuthApiClient,
          useValue: { me: () => of({ user: { id: "user" } }) },
        },
        {
          provide: ReferencesApiClient,
          useValue: { users: () => of([]), tags: () => of([]) },
        },
        { provide: BrnDialogRef, useValue: { close } },
        {
          provide: ToastService,
          useValue: { error: jest.fn(), success: jest.fn() },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "EN" },
        },
      ],
    });
  });
  function render() {
    const fixture = TestBed.createComponent(ClientFormComponent);
    fixture.detectChanges();
    return fixture;
  }
  it.each([
    "basic",
    "addresses",
    "contacts",
    "identification",
    "additional",
  ] as const)("opens the requested %s edit tab", (initialTab) => {
    context = { clientId: client.id, initialTab };
    const fixture = render();
    expect(fixture.componentInstance.activeSection()).toBe(initialTab);
    expect(
      fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]')
        .textContent,
    ).toContain(
      fixture.componentInstance.sections.find(
        (section) => section.id === initialTab,
      )?.label,
    );
  });
  it("renders five accessible sections and keeps primary channels in basic information", () => {
    const fixture = render();
    expect(fixture.nativeElement.querySelectorAll('[role="tab"]').length).toBe(
      5,
    );
    const input = fixture.nativeElement.querySelector(
      "#email",
    ) as HTMLInputElement;
    input.value = "main@test.rs";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(
      fixture.componentInstance.primaryContact().controls.email.value,
    ).toBe("main@test.rs");
    expect(fixture.nativeElement.querySelector("#contact-email-0")).toBeNull();
  });
  it("saves primary channels as one contact in the client transaction, without a duplicate contact request", () => {
    const { componentInstance: form } = render();
    form.form.patchValue({ firstName: "Ana", lastName: "Test" });
    form.primaryContact().patchValue({ email: "main@test.rs", phone: "123" });
    form.submit();
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryContact: expect.objectContaining({
          email: "main@test.rs",
          phone: "123",
        }),
      }),
    );
    expect(api.create.mock.calls[0][0]).not.toHaveProperty("email");
    expect(api.createContact).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(client);
  });
  it("uses existing primary contact instead of duplicated legacy client fields", () => {
    context = { clientId: client.id };
    api.listContacts.mockReturnValue(
      of([contact("main", true), contact("other")]),
    );
    const { componentInstance: form } = render();
    expect(form.primaryContact().controls.email.value).toBe("main@test.rs");
    form.selectPrimaryContact(1);
    expect(form.primaryContact().controls.email.value).toBe("other@test.rs");
    form.primaryContact().controls.email.setValue("changed@test.rs");
    expect(form.contacts.at(1).controls.email.value).toBe("changed@test.rs");
    form.submit();
    expect(api.update).toHaveBeenCalledWith(
      client.id,
      expect.objectContaining({
        primaryContact: expect.objectContaining({
          id: "other",
          email: "changed@test.rs",
        }),
      }),
    );
  });
  it("does not remove a primary contact or address through handlers", () => {
    const { componentInstance: form } = render();
    form.addAddress();
    form.removeAddress(0);
    form.removeContact(0);
    expect(form.addresses.length).toBe(1);
    expect(form.contacts.length).toBe(1);
  });
  it("retains legacy-only channels and other contacts when creating a primary", () => {
    context = { clientId: client.id };
    api.listContacts.mockReturnValue(of([contact("other")]));
    const { componentInstance: form } = render();
    expect(form.contacts.length).toBe(2);
    expect(form.primaryContact().controls.email.value).toBe(client.email);
    expect(form.contacts.at(1).controls.email.value).toBe("other@test.rs");
  });
  it("sends empty values to clear existing primary channels", () => {
    context = { clientId: client.id };
    api.listContacts.mockReturnValue(of([contact("main", true)]));
    const { componentInstance: form } = render();
    form.primaryContact().patchValue({ email: "", phone: "" });
    form.submit();
    expect(api.update).toHaveBeenCalledWith(
      client.id,
      expect.objectContaining({
        primaryContact: expect.objectContaining({
          id: "main",
          email: "",
          phone: "",
        }),
      }),
    );
  });
  it("blocks invalid primary email and switches back to Basic information", () => {
    const { componentInstance: form } = render();
    form.form.patchValue({ firstName: "Ana", lastName: "Test" });
    form.activeSection.set("additional");
    form.primaryContact().controls.email.setValue("invalid");
    form.submit();
    expect(form.activeSection()).toBe("basic");
    expect(api.create).not.toHaveBeenCalled();
  });
  it("does not save a failed edit load as a blank client", () => {
    context = { clientId: client.id };
    api.get.mockReturnValue(throwError(() => new Error("Failed")));
    const { componentInstance: form } = render();
    form.form.patchValue({ firstName: "Ana", lastName: "Test" });
    form.submit();
    expect(api.update).not.toHaveBeenCalled();
  });
  it("supports a channel-only organization primary without inventing a person name", () => {
    const { componentInstance: form } = render();
    form.form.patchValue({ type: "ORGANIZATION", organizationName: "Company" });
    form.primaryContact().patchValue({ email: "office@test.rs" });
    form.submit();
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryContact: expect.objectContaining({
          firstName: "",
          lastName: "",
          email: "office@test.rs",
        }),
      }),
    );
  });
});
