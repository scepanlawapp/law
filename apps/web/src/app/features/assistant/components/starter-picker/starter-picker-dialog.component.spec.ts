import { TestBed } from "@angular/core/testing";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of, throwError } from "rxjs";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { StarterPickKind } from "../../assistant-starter-prompts";
import {
  StarterPickerDialogComponent,
  foldSearchText,
} from "./starter-picker-dialog.component";

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => ({ kind: currentKind }),
}));

let currentKind: StarterPickKind = "case";

describe("StarterPickerDialogComponent", () => {
  beforeAll(() => {
    // jsdom has no layout; the command list scrolls the active item into view.
    Element.prototype.scrollIntoView ??= jest.fn();
  });

  const dialogRef = { close: jest.fn() };
  const cases = {
    list: jest.fn(() =>
      of({
        items: [
          {
            id: "case-7",
            caseNumber: "P-7/2026",
            name: "Naknada štete",
            client: { id: "client-1", displayName: "Petar Petrović" },
          },
        ],
      }),
    ),
  };
  const clients = { list: jest.fn() };
  const documents = {
    list: jest.fn(() =>
      of({
        items: [
          {
            id: "doc-1",
            title: "Ugovor o zakupu",
            currentVersion: { originalFilename: "zakup.pdf" },
          },
          { id: "doc-2", title: "Prazan", currentVersion: null },
        ],
      }),
    ),
  };
  const references = {
    users: jest.fn(() =>
      of([
        {
          userId: "user-2",
          role: "LAWYER",
          user: { firstName: "Đorđe", lastName: "Jović", email: "dj@x.rs" },
        },
        {
          userId: "user-3",
          role: "LAWYER",
          user: { firstName: "Ana", lastName: "Anić", email: "ana@x.rs" },
        },
      ]),
    ),
  };

  function render(kind: StarterPickKind) {
    currentKind = kind;
    TestBed.configureTestingModule({
      imports: [StarterPickerDialogComponent],
      providers: [
        { provide: BrnDialogRef, useValue: dialogRef },
        { provide: CasesApiClient, useValue: cases },
        { provide: ClientsApiClient, useValue: clients },
        { provide: DocumentsApiClient, useValue: documents },
        { provide: ReferencesApiClient, useValue: references },
      ],
    });
    const fixture = TestBed.createComponent(StarterPickerDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  const items = (fixture: { nativeElement: HTMLElement }) => [
    ...fixture.nativeElement.querySelectorAll<HTMLButtonElement>(
      "button[hlmCommandItem]",
    ),
  ];

  beforeEach(() => jest.clearAllMocks());

  it("lists cases and returns the exact case reference", () => {
    const fixture = render("case");

    expect(cases.list).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      pageSize: 20,
    });
    const [item] = items(fixture);
    expect(item.textContent).toContain("P-7/2026 Naknada štete");
    expect(item.textContent).toContain("Petar Petrović");
    item.click();

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "case-7",
        reference: "P-7/2026 („Naknada štete“)",
      }),
    );
  });

  it("searches on the server after a pause in typing", () => {
    jest.useFakeTimers();
    try {
      const fixture = render("case");
      fixture.componentInstance["onSearch"]("naknada");
      jest.advanceTimersByTime(250);

      expect(cases.list).toHaveBeenLastCalledWith({
        search: "naknada",
        page: 1,
        pageSize: 20,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("filters colleagues locally, ignoring diacritics", () => {
    jest.useFakeTimers();
    try {
      const fixture = render("person");
      expect(items(fixture)).toHaveLength(2);

      fixture.componentInstance["onSearch"]("djordje");
      jest.advanceTimersByTime(250);
      fixture.detectChanges();

      expect(items(fixture).map((item) => item.textContent?.trim())).toEqual([
        expect.stringContaining("Đorđe Jović"),
      ]);
      expect(references.users).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers only documents with a file and can hand off to attaching", () => {
    const fixture = render("document");

    expect(items(fixture)).toHaveLength(1);
    expect(documents.list).toHaveBeenCalledWith(
      expect.objectContaining({ archived: "false" }),
    );
    items(fixture)[0].click();
    expect(dialogRef.close).toHaveBeenLastCalledWith(
      expect.objectContaining({ reference: "„Ugovor o zakupu“ (doc:doc-1)" }),
    );

    const attach = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ].find((button) =>
      button.textContent?.includes("assistant.starter.picker.attachInstead"),
    );
    attach?.click();
    expect(dialogRef.close).toHaveBeenLastCalledWith("attach");
  });

  it("shows an error instead of an empty list when the search fails", () => {
    cases.list.mockReturnValueOnce(throwError(() => new Error("offline")));
    const fixture = render("case");

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')
        ?.textContent,
    ).toContain("assistant.starter.picker.error");
  });
});

describe("foldSearchText", () => {
  it("folds case and Serbian diacritics", () => {
    expect(foldSearchText("Đorđe ČIČIĆ Šušnjar")).toBe("djordje cicic susnjar");
  });
});
