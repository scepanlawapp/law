import { TestBed } from "@angular/core/testing";
import { FinancialsApiClient } from "@law/api-clients";
import { firstValueFrom, of, throwError } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { PriceCatalogDeleteService } from "./price-catalog-delete.service";

describe("PriceCatalogDeleteService", () => {
  const confirm = { confirm: jest.fn() };
  const api = { deletePriceSource: jest.fn() };
  let service: PriceCatalogDeleteService;
  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfirmDialogService, useValue: confirm },
        { provide: FinancialsApiClient, useValue: api },
      ],
    });
    service = TestBed.inject(PriceCatalogDeleteService);
  });
  it("never calls deletion when confirmation is cancelled", async () => {
    confirm.confirm.mockReturnValue(of(false));
    expect(
      await firstValueFrom(service.remove({ id: "catalog" } as never)),
    ).toBe(false);
    expect(api.deletePriceSource).not.toHaveBeenCalled();
  });
  it("deletes only the confirmed catalog", async () => {
    confirm.confirm.mockReturnValue(of(true));
    api.deletePriceSource.mockReturnValue(of({ deleted: true }));
    expect(
      await firstValueFrom(service.remove({ id: "catalog" } as never)),
    ).toBe(true);
    expect(api.deletePriceSource).toHaveBeenCalledWith("catalog");
  });
  it("propagates a failed deletion so callers keep the catalog and show an error", async () => {
    confirm.confirm.mockReturnValue(of(true));
    api.deletePriceSource.mockReturnValue(
      throwError(() => new Error("failed")),
    );
    await expect(
      firstValueFrom(service.remove({ id: "catalog" } as never)),
    ).rejects.toThrow("failed");
  });
});
