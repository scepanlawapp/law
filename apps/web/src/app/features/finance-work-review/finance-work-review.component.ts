import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import {
  CasesApiClient,
  ClientsApiClient,
  FinancialsApiClient,
} from "@law/api-clients";
import {
  BillingEntrySummary,
  BillingSuggestion,
  CaseSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { BillingEntryDialogService } from "./billing-entry-dialog.service";

type BillingList = "candidates" | "entries" | "dismissed";
type BillingSourceType =
  | "EVENT"
  | "TASK"
  | "DEADLINE"
  | "CASE_ACTIVITY"
  | "CLIENT_ACTIVITY";

@Component({
  selector: "law-finance-work-review",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./finance-work-review.component.html",
  imports: [
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmSelectImports,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
  ],
})
export class FinanceWorkReviewComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly entryDialog = inject(BillingEntryDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);

  readonly list = signal<BillingList>(
    this.route.snapshot.queryParamMap.get("tab") === "entries"
      ? "entries"
      : "candidates",
  );
  readonly candidates = signal<BillingSuggestion[]>([]);
  readonly entries = signal<BillingEntrySummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly clientIds = signal<string[]>([]);
  readonly caseIds = signal<string[]>([]);
  readonly sourceTypes = signal<BillingSourceType[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly selected = signal(new Set<string>());
  readonly selectedCandidateKeys = signal(new Set<string>());
  readonly bulkReviewPending = signal(false);

  readonly selectedCandidates = computed(() =>
    this.candidates().filter((candidate) =>
      this.selectedCandidateKeys().has(candidate.candidateKey),
    ),
  );
  readonly allVisibleCandidatesSelected = computed(
    () =>
      this.candidates().length > 0 &&
      this.candidates().every((candidate) =>
        this.selectedCandidateKeys().has(candidate.candidateKey),
      ),
  );
  readonly someVisibleCandidatesSelected = computed(
    () =>
      this.selectedCandidateKeys().size > 0 &&
      !this.allVisibleCandidatesSelected(),
  );

  readonly listOptions: ReadonlyArray<{ value: BillingList; label: string }> = [
    { value: "candidates", label: "finance.billingCandidates" },
    { value: "entries", label: "finance.billedEntries" },
    { value: "dismissed", label: "finance.dismissedCandidates" },
  ];
  readonly sourceOptions: ReadonlyArray<{
    value: BillingSourceType;
    label: string;
  }> = [
    { value: "EVENT", label: "finance.sourceEvent" },
    { value: "TASK", label: "finance.sourceTask" },
    { value: "DEADLINE", label: "finance.sourceDeadline" },
    { value: "CASE_ACTIVITY", label: "finance.sourceCaseActivity" },
    { value: "CLIENT_ACTIVITY", label: "finance.sourceClientActivity" },
  ];

  readonly listItemToString = (
    value: BillingList | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.listOptions.find((option) => option.value === value)?.label ??
            "",
        )
      : "";
  readonly clientItemToString = (value: string | null | undefined): string =>
    value
      ? (this.clients().find((client) => client.id === value)?.displayName ??
        value)
      : "";
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return "";
    const caseItem = this.cases().find((item) => item.id === value);
    return caseItem ? `${caseItem.caseNumber} — ${caseItem.name}` : value;
  };
  readonly sourceItemToString = (
    value: BillingSourceType | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.sourceOptions.find((option) => option.value === value)?.label ??
            "",
        )
      : "";

  readonly selectedClientsLabel = computed(() =>
    this.clientIds().map(this.clientItemToString).join(", "),
  );
  readonly selectedCasesLabel = computed(() =>
    this.caseIds().map(this.caseItemToString).join(", "),
  );
  readonly selectedSourcesLabel = computed(() =>
    this.sourceTypes().map(this.sourceItemToString).join(", "),
  );

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.casesApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.cases.set(response.items) });
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.list.set(
          params.get("tab") === "entries" ? "entries" : "candidates",
        );
        this.selectedCandidateKeys.set(new Set());
        this.loadCurrentList();
      });
  }

  selectList(value: string | null | undefined): void {
    const next: BillingList =
      value === "entries" || value === "dismissed" ? value : "candidates";
    if (next === this.list()) return;
    this.list.set(next);
    this.selected.set(new Set());
    this.selectedCandidateKeys.set(new Set());
    this.loadCurrentList();
  }

  setClientIds(value: string[]): void {
    this.clientIds.set(value);
    this.filtersChanged();
  }

  setCaseIds(value: string[]): void {
    this.caseIds.set(value);
    this.filtersChanged();
  }

  setSourceTypes(value: BillingSourceType[]): void {
    this.sourceTypes.set(value);
    this.filtersChanged();
  }

  loadCandidates(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .candidates({
        page: 1,
        pageSize: 50,
        clientIds: this.clientIds(),
        caseIds: this.caseIds(),
        sourceTypes: this.sourceTypes(),
        resolution: this.list() === "dismissed" ? "DISMISSED" : "PENDING",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.candidates.set(response.items);
          const candidateKey =
            this.route.snapshot.queryParamMap.get("candidateKey");
          const candidate = candidateKey
            ? response.items.find((item) => item.candidateKey === candidateKey)
            : undefined;
          if (candidate) this.recordCandidate(candidate);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  loadEntries(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .entries({
        page: 1,
        pageSize: 50,
        clientIds: this.clientIds(),
        caseIds: this.caseIds(),
        sourceTypes: this.sourceTypes(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.entries.set(response.items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  dismiss(item: BillingSuggestion): void {
    this.api
      .dismissCandidate(item.candidateKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadCandidates(),
        error: () => this.toast.error("finance.saveError"),
      });
  }

  reopen(item: BillingSuggestion): void {
    this.api
      .reopenCandidate(item.candidateKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadCandidates(),
        error: () => this.toast.error("finance.saveError"),
      });
  }

  toggleCandidate(item: BillingSuggestion): void {
    const selected = new Set(this.selectedCandidateKeys());
    if (selected.has(item.candidateKey)) selected.delete(item.candidateKey);
    else selected.add(item.candidateKey);
    this.selectedCandidateKeys.set(selected);
  }

  toggleAllVisibleCandidates(): void {
    if (this.allVisibleCandidatesSelected()) {
      this.selectedCandidateKeys.set(new Set());
      return;
    }
    this.selectedCandidateKeys.set(
      new Set(this.candidates().map((candidate) => candidate.candidateKey)),
    );
  }

  reviewSelectedCandidates(): void {
    const candidateKeys = [...this.selectedCandidateKeys()];
    if (!candidateKeys.length || this.bulkReviewPending()) return;

    this.bulkReviewPending.set(true);
    const request =
      this.list() === "dismissed"
        ? this.api.reopenCandidates(candidateKeys)
        : this.api.dismissCandidates(candidateKeys);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.bulkReviewPending.set(false);
        this.selectedCandidateKeys.set(new Set());
        this.loadCandidates();
      },
      error: () => {
        this.bulkReviewPending.set(false);
        this.toast.error("finance.saveError");
      },
    });
  }

  recordSelectedCandidate(): void {
    const selected = this.selectedCandidates();
    if (selected.length !== 1) return;
    this.recordCandidate(selected[0]);
  }

  recordCandidate(item: BillingSuggestion): void {
    this.entryDialog
      .open({ candidate: item })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((entry) => {
        if (!entry) return;
        this.api
          .recordCandidate(item.candidateKey, entry.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.selectedCandidateKeys.set(new Set());
              this.loadCandidates();
            },
            error: () => this.toast.error("finance.saveError"),
          });
      });
  }

  toggleEntry(entry: BillingEntrySummary): void {
    if (!this.isEligible(entry)) return;
    const current = new Set(this.selected());
    if (current.has(entry.id)) current.delete(entry.id);
    else if (
      !current.size ||
      this.entries().find((item) => item.id === [...current][0])?.client.id ===
        entry.client.id
    )
      current.add(entry.id);
    else this.toast.error("finance.selectionOneClient");
    this.selected.set(current);
  }

  isEligible(entry: BillingEntrySummary): boolean {
    return (
      entry.lifecycle === "READY" &&
      entry.disposition !== "INTERNAL" &&
      (!this.selected().size ||
        this.entries().find((item) => this.selected().has(item.id))
          ?.currency === entry.currency)
    );
  }

  formatCurrency(value: string, currency: string): string {
    return new Intl.NumberFormat(this.locale(), {
      style: "currency",
      currency,
    }).format(Number(value));
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  sourceLabel(value: string | null): string {
    const option = this.sourceOptions.find((item) => item.value === value);
    return option ? this.localization.translate(option.label) : (value ?? "—");
  }

  private filtersChanged(): void {
    this.selected.set(new Set());
    this.selectedCandidateKeys.set(new Set());
    this.loadCurrentList();
  }

  private loadCurrentList(): void {
    if (this.list() === "entries") this.loadEntries();
    else this.loadCandidates();
  }

  private locale(): string {
    return this.localization.language() === "SR" ? "sr-Latn-RS" : "en-US";
  }
}
