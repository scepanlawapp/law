import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { LocalizationService } from "../../../core/localization/localization.service";
import { WriteOffDialogComponent } from "./write-off-dialog.component";

describe("WriteOffDialogComponent", () => {
  const dialogRef = { close: jest.fn() };
  let fixture: ComponentFixture<WriteOffDialogComponent>;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: BrnDialogRef, useValue: dialogRef },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
    fixture = TestBed.createComponent(WriteOffDialogComponent);
    fixture.detectChanges();
  });

  const submit = () => {
    (fixture.nativeElement as HTMLElement)
      .querySelector("form")
      ?.dispatchEvent(new Event("submit"));
    fixture.detectChanges();
  };
  const type = (value: string) => {
    fixture.componentInstance.reason.setValue(value);
    fixture.detectChanges();
  };

  it.each(["", "   ", "\n\t "])(
    "blocks submit and shows an error for the reason %j",
    (value) => {
      type(value);
      submit();

      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')
          ?.textContent,
      ).toContain("time.writeOff.reasonRequired");
    },
  );

  it("closes with the trimmed reason", () => {
    type("  Nije za naplatu  ");
    submit();

    expect(dialogRef.close).toHaveBeenCalledWith("Nije za naplatu");
  });

  it("closes without a reason on cancel", () => {
    fixture.componentInstance.cancel();

    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
