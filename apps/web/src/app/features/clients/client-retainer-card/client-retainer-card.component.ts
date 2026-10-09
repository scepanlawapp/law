import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  BillingReportsApiClient,
  BillingSetupApiClient,
} from "@law/api-clients";
import type {
  ClientBillingProfile,
  RetainerAgreement,
  RetainerUsage,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmProgressImports } from "@spartan-ng/helm/progress";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideCoins,
  lucideFileText,
  lucidePencil,
  lucidePlus,
} from "@ng-icons/lucide";
import { EMPTY, catchError, filter, switchMap, tap } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  canManageBilling,
  canViewRetainers,
  formatDate,
  formatHours,
  formatMoney,
  isForbidden,
  isMonth,
  officeMonth,
  usagePercent,
  usageState,
} from "../../../shared/billing";
import { officeToday } from "../../time/time-utils";
import { ClientRateDialogService } from "./client-rate-dialog.service";
import { RetainerAgreementDialogService } from "./retainer-agreement-dialog.service";

/** Active retainer summary and this month's usage for a client (overview tab). */
@Component({
  selector: "law-client-retainer-card",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block min-w-0" },
  providers: [
    provideIcons({ lucideCoins, lucideFileText, lucidePencil, lucidePlus }),
  ],
  imports: [
    NgIcon,
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmProgressImports,
    HlmSpinner,
    HlmTooltip,
    TranslatePipe,
  ],
  templateUrl: "./client-retainer-card.component.html",
})
export class ClientRetainerCardComponent {
  private readonly setupApi = inject(BillingSetupApiClient);
  private readonly reportsApi = inject(BillingReportsApiClient);
  private readonly auth = inject(AuthState);
  private readonly localization = inject(LocalizationService);
  private readonly agreementDialog = inject(RetainerAgreementDialogService);
  private readonly rateDialog = inject(ClientRateDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = input.required<string>();

  private readonly role = computed(() => this.auth.activeWorkspace()?.role);
  readonly canView = computed(() => canViewRetainers(this.role()));
  readonly canManage = computed(() => canManageBilling(this.role()));

  readonly month = new FormControl(officeMonth(), { nonNullable: true });
  private readonly monthValue = signal(this.month.value);
  private readonly refreshTick = signal(0);

  readonly agreements = signal<RetainerAgreement[]>([]);
  readonly profile = signal<ClientBillingProfile | null>(null);
  readonly usage = signal<RetainerUsage | null>(null);
  /** The currency `targetHourlyRate` is expressed in; known to managers only. */
  readonly internalCurrency = signal<string | null>(null);
  /** The target rate can be set against the effective rate only in one currency. */
  readonly comparableTarget = computed(() => {
    const usage = this.usage();
    return (
      !!usage &&
      this.internalCurrency() !== null &&
      this.internalCurrency() === usage.currency
    );
  });
  readonly agreementsLoading = signal(true);
  readonly usageLoading = signal(true);
  readonly error = signal(false);
  /** The API refused this role: show nothing instead of an error. */
  readonly forbidden = signal(false);

  readonly loading = computed(
    () => this.agreementsLoading() || this.usageLoading(),
  );
  readonly visible = computed(() => this.canView() && !this.forbidden());

  /** The agreement behind this month's usage, else the one in force today. */
  readonly agreement = computed<RetainerAgreement | null>(() => {
    const active = this.agreements().filter((item) => item.active);
    const usage = this.usage();
    const forUsage = usage
      ? active.find((item) => item.id === usage.agreementId)
      : undefined;
    if (forUsage) return forUsage;
    const today = officeToday();
    const inForce = active
      .filter(
        (item) =>
          item.validFrom <= today && (!item.validTo || item.validTo >= today),
      )
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    if (inForce) return inForce;
    return (
      active
        .filter((item) => item.validFrom > today)
        .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null
    );
  });

  readonly percent = computed(() => {
    const usage = this.usage();
    return usage ? usagePercent(usage) : null;
  });
  readonly state = computed(() => {
    const usage = this.usage();
    return usage ? usageState(usage) : "ok";
  });
  readonly percentLabel = computed(() => Math.round(this.percent() ?? 0));
  /** The bar stops at 100 %; the label keeps showing the real overrun. */
  readonly progressValue = computed(() => Math.min(100, this.percentLabel()));

  readonly hoursLabel = computed(() => {
    const usage = this.usage();
    if (!usage) return "";
    const language = this.localization.language();
    const covered = formatHours(usage.coveredMinutes, language);
    return usage.includedMinutes
      ? `${covered} / ${formatHours(usage.includedMinutes, language)} h`
      : `${covered} h`;
  });
  readonly outOfScopeLabel = computed(() => {
    const usage = this.usage();
    return usage
      ? `${formatHours(usage.outOfScopeMinutes, this.localization.language())} h`
      : "";
  });

  constructor() {
    this.month.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.monthValue.set(value));

    effect(() => {
      const id = this.clientId();
      if (!this.canView()) return;
      untracked(() => {
        this.loadAgreements(id);
        this.loadProfile(id);
        if (this.canManage()) this.loadWorkspaceConfig();
      });
    });

    toObservable(
      computed(() => ({
        clientId: this.clientId(),
        month: this.monthValue(),
        tick: this.refreshTick(),
      })),
    )
      .pipe(
        filter((query) => this.canView() && isMonth(query.month)),
        tap(() => {
          this.usageLoading.set(true);
          this.error.set(false);
        }),
        // switchMap drops a slow response for a month the user already left.
        switchMap((query) =>
          this.reportsApi.clientUsage(query.clientId, query.month).pipe(
            catchError((error) => {
              this.usage.set(null);
              this.usageLoading.set(false);
              this.failed(error);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((usage) => {
        this.usage.set(usage);
        this.usageLoading.set(false);
      });
  }

  private loadAgreements(clientId: string): void {
    this.agreementsLoading.set(true);
    this.error.set(false);
    this.setupApi
      .listRetainers(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.agreements.set(items);
          this.agreementsLoading.set(false);
        },
        error: (error) => {
          this.agreementsLoading.set(false);
          this.failed(error);
        },
      });
  }

  private loadWorkspaceConfig(): void {
    this.setupApi
      .getWorkspaceConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => this.internalCurrency.set(config.internalCurrency),
        // Without the config the target is shown as unavailable, never mislabelled.
        error: () => this.internalCurrency.set(null),
      });
  }

  private loadProfile(clientId: string): void {
    this.setupApi
      .getProfile(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => this.profile.set(profile),
        // The hourly rate is secondary information; its failure must not hide the card.
        error: (error) => {
          if (isForbidden(error)) this.forbidden.set(true);
        },
      });
  }

  private failed(error: unknown): void {
    if (isForbidden(error)) this.forbidden.set(true);
    else this.error.set(true);
  }

  editAgreement(): void {
    this.agreementDialog
      .open({ clientId: this.clientId(), agreement: this.agreement() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (!saved) return;
        this.error.set(false);
        this.loadAgreements(this.clientId());
        this.refreshTick.update((tick) => tick + 1);
      });
  }

  editClientRate(): void {
    this.rateDialog
      .open({ clientId: this.clientId(), profile: this.profile() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.profile.set(saved);
      });
  }

  money(amount: string, currency: string): string {
    return formatMoney(amount, currency, this.localization.language());
  }

  date(value: string): string {
    return formatDate(value, this.localization.language());
  }
}
