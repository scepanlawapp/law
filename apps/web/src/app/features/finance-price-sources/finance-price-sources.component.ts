import { ActivatedRoute } from "@angular/router";
import { EMPTY, catchError, expand, of, reduce, switchMap, tap } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import {
  ClientsApiClient,
  CasesApiClient,
  FinancialsApiClient,
} from "@law/api-clients";
import {
  ClientSummary,
  CaseSummary,
  PriceSourceScope,
  PriceSourceSummary,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
} from "@spartan-ng/helm/combobox";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";

type SourceTab =
  | "CLIENT_AGREEMENT"
  | "WORKSPACE_PUBLIC_REFERENCE"
  | "COMPANY_CATALOG";

@Component({
  selector: "law-finance-price-sources",
  standalone: true,
  templateUrl: "./finance-price-sources.component.html",
  imports: [
    DatePipe,
    ReactiveFormsModule,
    HlmButton,
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
    HlmInput,
    HlmTextarea,
    HlmSpinner,
    TranslatePipe,
  ],
})
export class FinancePriceSourcesComponent {
  private readonly route = inject(ActivatedRoute, { optional: true });
  private openedLinkedSource = false;
  private readonly api = inject(FinancialsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly localization = inject(LocalizationService);
  readonly cases = signal<CaseSummary[]>([]);
  readonly casesLoading = signal(false);
  readonly casesError = signal(false);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly tab = signal<SourceTab>("CLIENT_AGREEMENT");
  readonly sources = signal<PriceSourceSummary[]>([]);
  readonly selectedSource = signal<PriceSourceSummary | null>(null);
  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal("");
  readonly form = new FormGroup({
    title: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    clientId: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    caseId: new FormControl("", { nonNullable: true }),
    rawText: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    sourceUrl: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.form.controls.clientId.valueChanges
      .pipe(
        tap(() => {
          this.form.controls.caseId.setValue("");
          this.cases.set([]);
          this.casesError.set(false);
        }),
        switchMap((clientId) => {
          this.casesLoading.set(!!clientId);
          if (!clientId) return of([] as CaseSummary[]);
          return this.casesApi.list({ clientId, page: 1, pageSize: 100 }).pipe(
            expand((response) =>
              response.meta.hasNextPage
                ? this.casesApi.list({
                    clientId,
                    page: response.meta.page + 1,
                    pageSize: 100,
                  })
                : EMPTY,
            ),
            reduce(
              (items, response) => [...items, ...response.items],
              [] as CaseSummary[],
            ),
            catchError(() => {
              this.casesError.set(true);
              return of([] as CaseSummary[]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.cases.set(items);
        this.casesLoading.set(false);
      });
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .priceSources()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.sources.set(items);
          const sourceId = this.route?.snapshot.queryParamMap.get("sourceId");
          const linkedSource =
            sourceId && !this.openedLinkedSource
              ? items.find((item) => item.id === sourceId)
              : undefined;
          if (linkedSource) {
            this.openedLinkedSource = true;
            this.selectTab(
              linkedSource.scope === "CASE_OVERRIDE"
                ? "CLIENT_AGREEMENT"
                : linkedSource.scope,
            );
            this.selectSource(linkedSource);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.message.set("finance.loadError");
        },
      });
  }
  selectTab(tab: SourceTab): void {
    this.tab.set(tab);
    this.selectedSource.set(null);
    if (tab === "CLIENT_AGREEMENT") {
      this.form.controls.clientId.addValidators(Validators.required);
    } else {
      this.form.controls.clientId.clearValidators();
    }
    this.form.controls.clientId.updateValueAndValidity();
    this.form.reset({
      title: "",
      clientId: "",
      caseId: "",
      rawText: "",
      sourceUrl: "",
    });
  }
  selectSource(source: PriceSourceSummary): void {
    this.selectedSource.set(source);
    const version = source.versions[0];
    this.form.patchValue({
      title: source.title,
      clientId: source.clientId ?? "",
      caseId: source.caseId ?? "",
      rawText: version?.rawText ?? "",
      sourceUrl: source.sourceUrl ?? "",
    });
    this.api
      .priceSourceVersions(source.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (versions) => {
          if (this.selectedSource()?.id !== source.id) return;
          this.selectedSource.set({ ...source, versions });
          const current = versions[0];
          if (current) this.form.controls.rawText.setValue(current.rawText);
        },
      });
  }
  visibleSources(): PriceSourceSummary[] {
    const scope: PriceSourceScope = this.tab();
    return this.sources().filter(
      (source) =>
        source.scope === scope ||
        (scope === "CLIENT_AGREEMENT" && source.scope === "CASE_OVERRIDE"),
    );
  }
  clientName(clientId: string | null): string {
    return (
      this.clients().find((client) => client.id === clientId)?.displayName ??
      "—"
    );
  }
  readonly clientItemToString = (value: string | null | undefined): string =>
    value ? this.clientName(value) : "";

  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("finance.allCases");
    const item = this.cases().find((item) => item.id === value);
    return item
      ? `${item.caseNumber} · ${item.name}`
      : this.localization.translate("finance.case");
  };

  retryCases(): void {
    const caseId = this.form.controls.caseId.value;
    this.form.controls.clientId.setValue(this.form.controls.clientId.value);
    this.form.controls.caseId.setValue(caseId);
  }

  setCaseId(value: string | null | undefined): void {
    this.form.controls.caseId.setValue(value ?? "");
  }

  setClientId(value: string | null | undefined): void {
    this.form.controls.clientId.setValue(value ?? "");
    this.form.controls.clientId.markAsTouched();
  }
  save(): void {
    if (
      this.saving() ||
      this.casesLoading() ||
      (this.casesError() && !this.selectedSource())
    )
      return;
    if (this.tab() !== "CLIENT_AGREEMENT") {
      this.form.controls.clientId.setValue("");
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.message.set("finance.validationError");
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const selectedSource = this.selectedSource();
    const operation = selectedSource
      ? this.api.appendPriceSourceVersion(selectedSource.id, value.rawText)
      : this.api.createPriceSource({
          scope:
            this.tab() === "CLIENT_AGREEMENT" && value.caseId
              ? "CASE_OVERRIDE"
              : this.tab(),
          title: value.title,
          rawText: value.rawText,
          clientId: value.clientId || undefined,
          caseId:
            this.tab() === "CLIENT_AGREEMENT"
              ? value.caseId || undefined
              : undefined,
          sourceUrl: value.sourceUrl || undefined,
        });
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.message.set("finance.saved");
        this.selectedSource.set(null);
        this.form.reset({
          title: "",
          clientId: "",
          caseId: "",
          rawText: "",
          sourceUrl: "",
        });
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.message.set("finance.saveError");
      },
    });
  }
}
