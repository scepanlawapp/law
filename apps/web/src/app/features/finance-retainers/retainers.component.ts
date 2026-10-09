import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import {
  ClientsApiClient,
  BillingReportsApiClient,
  BillingSetupApiClient,
} from "@law/api-clients";
import type {
  ClientSummary,
  RetainerAgreement,
  RetainerUsage,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmProgressImports } from "@spartan-ng/helm/progress";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTable,
  HlmTableContainer,
  HlmTr,
} from "@spartan-ng/helm/table";
import { EMPTY, catchError, filter, switchMap, tap } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  canManageBilling,
  formatHours,
  formatMoney,
  isForbidden,
  isMonth,
  officeMonth,
  usagePercent,
  usageState,
} from "../../shared/billing";
import { RetainerAgreementDialogService } from "../clients/client-retainer-card/retainer-agreement-dialog.service";
import type { UsageState } from "../../shared/billing";

interface UsageRow {
  usage: RetainerUsage;
  percent: number | null;
  state: UsageState;
}

/** Highest usage first; agreements without an hour cap go last, by client name. */
export function sortByUsage(items: readonly RetainerUsage[]): UsageRow[] {
  return items
    .map((usage) => {
      const percent = usagePercent(usage);
      return { usage, percent, state: usageState(usage) };
    })
    .sort((a, b) => {
      if (a.percent === null && b.percent === null) {
        return a.usage.client.displayName.localeCompare(
          b.usage.client.displayName,
        );
      }
      if (a.percent === null) return 1;
      if (b.percent === null) return -1;
      return b.percent - a.percent;
    });
}

@Component({
  selector: "law-finance-retainers",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmProgressImports,
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
  templateUrl: "./retainers.component.html",
  host: { class: "block min-w-0" },
})
export class FinanceRetainersComponent {
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly api = inject(BillingReportsApiClient);
  private readonly setupApi = inject(BillingSetupApiClient);
  private readonly agreementDialog = inject(RetainerAgreementDialogService);
  private readonly auth = inject(AuthState);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly month = new FormControl(officeMonth(), { nonNullable: true });
  private readonly monthValue = signal(this.month.value);
  readonly selectedClient = new FormControl(
    { value: "", disabled: true },
    { nonNullable: true },
  );
  readonly selectedClientId = signal("");
  readonly clients = signal<ClientSummary[]>([]);
  readonly clientsLoading = signal(false);
  readonly clientsError = signal(false);
  readonly openingAgreement = signal(false);
  readonly createError = signal(false);
  readonly editingAgreementId = signal<string | null>(null);
  readonly editError = signal(false);
  private readonly refreshTick = signal(0);

  readonly items = signal<RetainerUsage[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly forbidden = signal(false);

  /** The currency `targetHourlyRate` is expressed in; known to managers only. */
  readonly internalCurrency = signal<string | null>(null);

  readonly rows = computed(() => sortByUsage(this.items()));
  readonly canManage = computed(() =>
    canManageBilling(this.auth.activeWorkspace()?.role),
  );
  readonly canCreateAgreement = computed(
    () =>
      this.canManage() &&
      !!this.selectedClientId() &&
      !this.clientsLoading() &&
      !this.openingAgreement() &&
      this.editingAgreementId() === null,
  );
  readonly clientItemToString = (value: string | null | undefined): string => {
    if (!value)
      return this.localization.translate("retainers.list.chooseClient");
    return (
      this.clients().find((client) => client.id === value)?.displayName ?? value
    );
  };

  constructor() {
    if (this.canManage()) {
      this.setupApi
        .getWorkspaceConfig()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (config) => this.internalCurrency.set(config.internalCurrency),
          // Without the config the target is shown as unavailable, never mislabelled.
          error: () => this.internalCurrency.set(null),
        });

      this.clientsLoading.set(true);
      this.clientsApi
        .list({ page: 1, pageSize: 100, status: "ACTIVE" })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.clients.set(response.items);
            this.selectedClient.enable({ emitEvent: false });
            this.clientsLoading.set(false);
          },
          error: () => {
            this.clientsError.set(true);
            this.clientsLoading.set(false);
          },
        });
    }

    this.month.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.monthValue.set(value));
    this.selectedClient.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.selectedClientId.set(value));

    toObservable(
      computed(() => ({
        month: this.monthValue(),
        refresh: this.refreshTick(),
      })),
    )
      .pipe(
        filter(({ month }) => isMonth(month)),
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        // switchMap drops a slow response for a month the user already left.
        switchMap(({ month }) =>
          this.api.usage(month).pipe(
            catchError((error) => {
              this.items.set([]);
              this.loading.set(false);
              if (isForbidden(error)) this.forbidden.set(true);
              else this.error.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.items.set(items);
        this.loading.set(false);
      });
  }

  createAgreement(): void {
    const clientId = this.selectedClientId();
    if (
      !this.canManage() ||
      !clientId ||
      this.openingAgreement() ||
      this.editingAgreementId() !== null
    )
      return;

    this.createError.set(false);
    this.openingAgreement.set(true);
    this.agreementDialog
      .open({ clientId, agreement: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.openingAgreement.set(false);
          if (!saved) return;
          this.error.set(false);
          this.refreshTick.update((tick) => tick + 1);
        },
        error: () => {
          this.openingAgreement.set(false);
          this.createError.set(true);
        },
      });
  }

  editAgreement(row: UsageRow): void {
    if (
      !this.canManage() ||
      this.openingAgreement() ||
      this.editingAgreementId() !== null
    )
      return;

    const { client, agreementId } = row.usage;
    this.editError.set(false);
    this.editingAgreementId.set(agreementId);
    this.setupApi
      .listRetainers(client.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agreements) => {
          const agreement = agreements.find(
            (item: RetainerAgreement) => item.id === agreementId,
          );
          if (!agreement) {
            this.editingAgreementId.set(null);
            this.editError.set(true);
            return;
          }

          this.agreementDialog
            .open({ clientId: client.id, agreement })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (saved) => {
                this.editingAgreementId.set(null);
                if (saved) this.refreshTick.update((tick) => tick + 1);
              },
              error: () => {
                this.editingAgreementId.set(null);
                this.editError.set(true);
              },
            });
        },
        error: () => {
          this.editingAgreementId.set(null);
          this.editError.set(true);
        },
      });
  }

  hours(minutes: number): string {
    return `${formatHours(minutes, this.localization.language())} h`;
  }

  money(amount: string, currency: string): string {
    return formatMoney(amount, currency, this.localization.language());
  }

  /** The bar stops at 100 %; the label keeps showing the real overrun. */
  barValue(percent: number | null): number {
    return Math.min(100, this.percentLabel(percent));
  }

  percentLabel(percent: number | null): number {
    return Math.round(percent ?? 0);
  }
}
