import { PriceCatalogDialogService } from "./price-catalog-dialog.service";
import { PriceCatalogDeleteService } from "./price-catalog-delete.service";
import { ActivatedRoute } from "@angular/router";
import { EMPTY, catchError, expand, of, reduce, switchMap, tap } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
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
import {
  PRICE_SOURCE_TAB_LABELS,
  PriceSourceTab,
  optionsFrom,
} from "../../shared/models";
import { FIRST_PAGE } from "../../shared/pagination/paginated-list";

@Component({
  selector: "law-finance-price-sources",
  standalone: true,
  templateUrl: "./finance-price-sources.component.html",
  imports: [
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
  private readonly catalogDialog = inject(PriceCatalogDialogService);
  private readonly catalogDelete = inject(PriceCatalogDeleteService);
  readonly deleting = signal(false);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private openedLinkedSource = false;
  readonly contextClientId =
    this.route?.snapshot.queryParamMap.get("clientId") ?? "";
  readonly filterClientId = signal(this.contextClientId);
  readonly filterCaseId = signal("");
  readonly directoryCases = signal<CaseSummary[]>([]);
  readonly directoryLoading = signal(false);
  readonly directoryError = signal(false);
  readonly filterCases = computed(() =>
    this.directoryCases().filter(
      (item) =>
        !this.filterClientId() || item.client.id === this.filterClientId(),
    ),
  );
  readonly filterValue = computed(() =>
    this.filterCaseId()
      ? `case:${this.filterCaseId()}`
      : this.filterClientId()
        ? `client:${this.filterClientId()}`
        : "",
  );
  readonly caseRequired = signal(false);
  private readonly api = inject(FinancialsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly localization = inject(LocalizationService);
  readonly cases = signal<CaseSummary[]>([]);
  readonly casesLoading = signal(false);
  readonly casesError = signal(false);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly tab = signal<PriceSourceTab>(PriceSourceScope.CLIENT_AGREEMENT);
  readonly tabOptions = optionsFrom(PRICE_SOURCE_TAB_LABELS);
  readonly PriceSourceScope = PriceSourceScope;
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
          this.casesLoading.set(true);

          return this.casesApi
            .list({ ...FIRST_PAGE, clientId: clientId || undefined })
            .pipe(
              expand((response) =>
                response.meta.hasNextPage
                  ? this.casesApi.list({
                      ...FIRST_PAGE,
                      clientId: clientId || undefined,
                      page: response.meta.page + 1,
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
      .list(FIRST_PAGE)
      .pipe(
        expand((response) =>
          response.meta?.hasNextPage
            ? this.clientsApi.list({
                ...FIRST_PAGE,
                page: response.meta.page + 1,
              })
            : EMPTY,
        ),
        reduce(
          (items, response) => [...items, ...response.items],
          [] as ClientSummary[],
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => {
          this.clients.set(items);
          // A client detail link can reference a client outside the first list page.
          if (
            this.contextClientId &&
            !items.some((client) => client.id === this.contextClientId)
          ) {
            this.clientsApi
              .get(this.contextClientId)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (client) =>
                  this.clients.update((clients) => [
                    ...clients.filter((item) => item.id !== client.id),
                    client,
                  ]),
                error: () => this.message.set("finance.loadError"),
              });
          }
        },
        error: () => this.message.set("finance.loadError"),
      });
    const scope = this.route?.snapshot.queryParamMap.get("scope");
    if (
      scope === PriceSourceScope.COMPANY_CATALOG ||
      scope === PriceSourceScope.WORKSPACE_PUBLIC_REFERENCE
    )
      this.selectTab(scope);
    else {
      this.selectTab(PriceSourceScope.CLIENT_AGREEMENT);
      if (scope === PriceSourceScope.CASE_OVERRIDE) {
        this.caseRequired.set(true);
        this.form.controls.caseId.addValidators(Validators.required);
        this.form.controls.caseId.updateValueAndValidity();
      }
    }
    this.load();
    this.loadDirectoryCases();
  }

  create(): void {
    if (this.saving()) return;
    this.selectTab(this.tab());
    if (this.tab() === PriceSourceScope.CLIENT_AGREEMENT)
      this.setCaseId(this.filterCaseId());
    this.message.set("");
  }
  view(source: PriceSourceSummary): void {
    this.catalogDialog
      .open(source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((deleted) => {
        if (deleted) this.afterDelete(source);
      });
  }
  remove(source: PriceSourceSummary): void {
    if (this.deleting() || this.saving()) return;
    this.deleting.set(true);
    this.catalogDelete
      .remove(source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deleted) => {
          this.deleting.set(false);
          if (deleted) this.afterDelete(source);
        },
        error: () => {
          this.deleting.set(false);
          this.message.set("finance.deleteCatalogError");
        },
      });
  }
  private afterDelete(source: PriceSourceSummary): void {
    if (this.selectedSource()?.id === source.id) this.create();
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
              linkedSource.scope === PriceSourceScope.CASE_OVERRIDE
                ? PriceSourceScope.CLIENT_AGREEMENT
                : linkedSource.scope,
            );
            this.selectSource(linkedSource);
          }
          if (!this.selectedSource()) this.matchCatalog();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.message.set("finance.loadError");
        },
      });
  }
  selectTab(tab: PriceSourceTab): void {
    this.tab.set(tab);
    this.caseRequired.set(false);
    this.form.controls.caseId.clearValidators();
    this.form.controls.caseId.updateValueAndValidity();
    this.selectedSource.set(null);
    if (tab === PriceSourceScope.CLIENT_AGREEMENT) {
      this.form.controls.clientId.addValidators(Validators.required);
    } else {
      this.form.controls.clientId.clearValidators();
    }
    this.form.controls.clientId.updateValueAndValidity();
    this.form.reset({
      title: "",
      clientId:
        tab === PriceSourceScope.CLIENT_AGREEMENT ? this.filterClientId() : "",
      caseId: "",
      rawText: "",
      sourceUrl: "",
    });
  }
  selectSource(source: PriceSourceSummary): void {
    this.selectedSource.set(source);
    this.caseRequired.set(false);
    this.form.controls.caseId.clearValidators();
    this.form.controls.caseId.updateValueAndValidity();
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
    const clientAgreements = scope === PriceSourceScope.CLIENT_AGREEMENT;
    return this.sources().filter(
      (source) =>
        (source.scope === scope ||
          (clientAgreements &&
            source.scope === PriceSourceScope.CASE_OVERRIDE)) &&
        (!clientAgreements ||
          ((!this.filterClientId() ||
            source.clientId === this.filterClientId()) &&
            (!this.filterCaseId() || source.caseId === this.filterCaseId()))),
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

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.localization.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("finance.allCases");
    const item = [...this.cases(), ...this.directoryCases()].find(
      (item) => item.id === value,
    );
    return item
      ? `${item.caseNumber} · ${item.name}`
      : this.localization.translate("finance.case");
  };

  retryCases(): void {
    const caseId = this.form.controls.caseId.value;
    this.form.controls.clientId.setValue(this.form.controls.clientId.value);
    this.form.controls.caseId.setValue(caseId);
  }

  loadDirectoryCases(): void {
    this.directoryLoading.set(true);
    this.directoryError.set(false);
    this.casesApi
      .list(FIRST_PAGE)
      .pipe(
        expand((response) =>
          response.meta.hasNextPage
            ? this.casesApi.list({
                ...FIRST_PAGE,
                page: response.meta.page + 1,
              })
            : EMPTY,
        ),
        reduce(
          (items, response) => [...items, ...response.items],
          [] as CaseSummary[],
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => {
          this.directoryCases.set(items);
          this.directoryLoading.set(false);
        },
        error: () => {
          this.directoryError.set(true);
          this.directoryLoading.set(false);
        },
      });
  }
  readonly filterItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("finance.catalogFilterAll");
    return value.startsWith("client:")
      ? this.clientName(value.slice(7))
      : this.caseItemToString(value.slice(5));
  };
  setFilter(value: string | null | undefined): void {
    if (this.saving()) return;
    if (!value) {
      this.filterClientId.set("");
      this.filterCaseId.set("");
      this.setClientId("");
    } else if (value.startsWith("client:")) {
      this.filterClientId.set(value.slice(7));
      this.filterCaseId.set("");
      this.setClientId(value.slice(7));
    } else {
      const item = this.directoryCases().find(
        (item) => item.id === value.slice(5),
      );
      if (
        !item ||
        (this.filterClientId() && item.client.id !== this.filterClientId())
      )
        return;
      this.filterClientId.set(item.client.id);
      this.filterCaseId.set(item.id);
      this.setClientId(item.client.id);
      this.setCaseId(item.id);
    }
  }
  private matchCatalog(): void {
    if (this.tab() !== PriceSourceScope.CLIENT_AGREEMENT) return;
    const { clientId, caseId } = this.form.getRawValue();
    if (this.caseRequired() && !caseId) return;
    const match = this.sources()
      .filter(
        (source) =>
          (source.scope === PriceSourceScope.CLIENT_AGREEMENT ||
            source.scope === PriceSourceScope.CASE_OVERRIDE) &&
          source.clientId === clientId &&
          (source.caseId ?? "") === caseId,
      )
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )[0];
    if (match) this.selectSource(match);
    else if (this.selectedSource()) {
      this.selectedSource.set(null);
      this.form.patchValue({ title: "", rawText: "", sourceUrl: "" });
    }
  }
  setCaseId(value: string | null | undefined): void {
    const item = [...this.cases(), ...this.directoryCases()].find(
      (item) => item.id === value,
    );
    if (item?.client && this.form.controls.clientId.value !== item.client.id)
      this.form.controls.clientId.setValue(item.client.id);
    this.form.controls.caseId.setValue(value ?? "");
    this.matchCatalog();
  }
  setClientId(value: string | null | undefined): void {
    this.form.controls.clientId.setValue(value ?? "");
    this.form.controls.clientId.markAsTouched();
    this.matchCatalog();
  }
  save(): void {
    if (
      this.saving() ||
      this.casesLoading() ||
      (this.casesError() && !this.selectedSource())
    )
      return;
    if (this.tab() !== PriceSourceScope.CLIENT_AGREEMENT) {
      this.form.controls.clientId.setValue("");
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.message.set("finance.validationError");
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const clientAgreement = this.tab() === PriceSourceScope.CLIENT_AGREEMENT;
    const selectedSource = this.selectedSource();
    const operation = selectedSource
      ? this.api.appendPriceSourceVersion(selectedSource.id, value.rawText)
      : this.api.createPriceSource({
          scope:
            clientAgreement && value.caseId
              ? PriceSourceScope.CASE_OVERRIDE
              : this.tab(),
          title: value.title,
          rawText: value.rawText,
          clientId: value.clientId || undefined,
          caseId: clientAgreement ? value.caseId || undefined : undefined,
          sourceUrl: value.sourceUrl || undefined,
        });
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.message.set("finance.saved");
        const onClientAgreements =
          this.tab() === PriceSourceScope.CLIENT_AGREEMENT;
        if (onClientAgreements) {
          this.filterClientId.set(value.clientId);
          this.filterCaseId.set(value.caseId);
        }
        this.selectedSource.set(null);
        this.form.reset({
          title: "",
          clientId: onClientAgreements ? this.filterClientId() : "",
          caseId: onClientAgreements ? value.caseId : "",
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
