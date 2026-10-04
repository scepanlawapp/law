import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BillingSetupApiClient, ReferencesApiClient } from "@law/api-clients";
import type { ServiceCategory, UserRate } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import {
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTable,
  HlmTableContainer,
  HlmTr,
} from "@spartan-ng/helm/table";
import { forkJoin } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  MONEY_INPUT_PATTERN,
  formatDate,
  formatMoney,
  isForbidden,
  normalizeMoney,
  positiveMoneyValidator,
} from "../../shared/billing";
import {
  CURRENCY_OPTIONS,
  createCurrencyItemToString,
} from "../../shared/currency";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { integerValidator } from "../time/validators";
import { officeToday } from "../time/time-utils";

interface UserRow {
  id: string;
  name: string;
  rate: UserRate | null;
}

const VAT_PATTERN = /^\d{1,3}([.,]\d{1,2})?$/;

/** Workspace billing config, service categories and user hourly rates (OWNER/ADMIN). */
@Component({
  selector: "law-billing-settings",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmSwitch,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
  ],
  templateUrl: "./billing-settings.component.html",
  host: { class: "block min-w-0" },
})
export class BillingSettingsComponent {
  private readonly api = inject(BillingSetupApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );

  // Workspace config
  readonly configForm = new FormGroup({
    targetHourlyRate: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.pattern(MONEY_INPUT_PATTERN),
        positiveMoneyValidator,
      ],
    }),
    internalCurrency: new FormControl("RSD", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    defaultVatRate: new FormControl("20", {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(VAT_PATTERN)],
    }),
    paymentTermDays: new FormControl<number | null>(15, {
      validators: [
        Validators.required,
        integerValidator,
        Validators.min(0),
        Validators.max(365),
      ],
    }),
  });
  /**
   * The saved internal currency. Rates must use it (the API rejects any other),
   * so it is never read from the unsaved config form.
   */
  readonly savedCurrency = signal("RSD");
  readonly configLoading = signal(true);
  readonly configError = signal(false);
  readonly configSaving = signal(false);

  // Service categories
  readonly categories = signal<ServiceCategory[]>([]);
  readonly categoriesLoading = signal(true);
  readonly categoriesError = signal(false);
  readonly categoryBusy = signal(false);
  readonly newCategoryName = new FormControl("", {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });
  readonly editingCategoryId = signal<string | null>(null);
  readonly editCategoryName = new FormControl("", {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });

  // User rates
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly rates = signal<UserRate[]>([]);
  readonly ratesLoading = signal(true);
  readonly ratesError = signal(false);
  readonly rateSaving = signal(false);
  readonly rateUserId = signal<string | null>(null);
  readonly rateForm = new FormGroup({
    hourlyValue: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(MONEY_INPUT_PATTERN),
        positiveMoneyValidator,
      ],
    }),
    effectiveFrom: new FormControl(officeToday(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly rateUserName = computed(
    () =>
      this.users().find((user) => user.id === this.rateUserId())?.name ?? "",
  );

  /** Each user with the newest rate already in effect today. */
  readonly userRows = computed<UserRow[]>(() => {
    const today = officeToday();
    return this.users().map((user) => {
      const current = this.rates()
        .filter(
          (rate) => rate.userId === user.id && rate.effectiveFrom <= today,
        )
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      return { ...user, rate: current ?? null };
    });
  });

  constructor() {
    this.loadConfig();
    this.loadCategories();
    this.loadRates();
  }

  // ---- Workspace config

  private loadConfig(): void {
    this.api
      .getWorkspaceConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.configForm.reset({
            targetHourlyRate: config.targetHourlyRate ?? "",
            internalCurrency: config.internalCurrency,
            defaultVatRate: config.defaultVatRate,
            paymentTermDays: config.paymentTermDays,
          });
          this.savedCurrency.set(config.internalCurrency);
          this.configLoading.set(false);
        },
        error: () => {
          this.configLoading.set(false);
          this.configError.set(true);
        },
      });
  }

  saveConfig(): void {
    if (this.configForm.invalid) {
      this.configForm.markAllAsTouched();
      return;
    }
    const value = this.configForm.getRawValue();
    this.configSaving.set(true);
    this.api
      .updateWorkspaceConfig({
        targetHourlyRate: normalizeMoney(value.targetHourlyRate),
        internalCurrency: value.internalCurrency,
        defaultVatRate: normalizeMoney(value.defaultVatRate) ?? "0",
        paymentTermDays: value.paymentTermDays ?? 0,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.configForm.reset({
            targetHourlyRate: config.targetHourlyRate ?? "",
            internalCurrency: config.internalCurrency,
            defaultVatRate: config.defaultVatRate,
            paymentTermDays: config.paymentTermDays,
          });
          this.savedCurrency.set(config.internalCurrency);
          this.configSaving.set(false);
          this.toast.success(this.localization.translate("billing.saved"));
        },
        error: () => {
          this.configSaving.set(false);
          this.toast.error(this.localization.translate("billing.saveError"));
        },
      });
  }

  // ---- Service categories

  private loadCategories(): void {
    this.api
      .listCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.categories.set(this.sortCategories(items));
          this.categoriesLoading.set(false);
        },
        error: () => {
          this.categoriesLoading.set(false);
          this.categoriesError.set(true);
        },
      });
  }

  private sortCategories(items: ServiceCategory[]): ServiceCategory[] {
    return [...items].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
  }

  private replaceCategory(updated: ServiceCategory): void {
    this.categories.update((items) =>
      this.sortCategories(
        items.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
  }

  addCategory(): void {
    if (this.newCategoryName.invalid) {
      this.newCategoryName.markAsTouched();
      return;
    }
    const order =
      this.categories().reduce((max, item) => Math.max(max, item.order), -1) +
      1;
    this.categoryBusy.set(true);
    this.api
      .createCategory({ name: this.newCategoryName.value.trim(), order })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.categories.update((items) =>
            this.sortCategories([...items, created]),
          );
          this.newCategoryName.reset("");
          this.categoryBusy.set(false);
        },
        error: (error) => this.categoryFailed(error),
      });
  }

  startRename(category: ServiceCategory): void {
    this.editingCategoryId.set(category.id);
    this.editCategoryName.setValue(category.name);
  }

  cancelRename(): void {
    this.editingCategoryId.set(null);
  }

  saveRename(category: ServiceCategory): void {
    const name = this.editCategoryName.value.trim();
    if (this.editCategoryName.invalid) {
      this.editCategoryName.markAsTouched();
      return;
    }
    if (name === category.name) {
      this.editingCategoryId.set(null);
      return;
    }
    this.categoryBusy.set(true);
    this.api
      .updateCategory(category.id, { name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.replaceCategory(updated);
          this.editingCategoryId.set(null);
          this.categoryBusy.set(false);
        },
        error: (error) => this.categoryFailed(error),
      });
  }

  setCategoryActive(category: ServiceCategory, active: boolean): void {
    this.categoryBusy.set(true);
    this.api
      .updateCategory(category.id, { active })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.replaceCategory(updated);
          this.categoryBusy.set(false);
        },
        error: (error) => this.categoryFailed(error),
      });
  }

  /** Moves a category one place and renumbers only the rows whose order changed. */
  moveCategory(category: ServiceCategory, direction: -1 | 1): void {
    const items = [...this.categories()];
    const index = items.findIndex((item) => item.id === category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    const changed = items
      .map((item, position) => ({ item, position }))
      .filter(({ item, position }) => item.order !== position);
    if (!changed.length) return;
    this.categoryBusy.set(true);
    forkJoin(
      changed.map(({ item, position }) =>
        this.api.updateCategory(item.id, { order: position }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          const byId = new Map(updated.map((item) => [item.id, item]));
          this.categories.set(
            items.map(
              (item, position) =>
                byId.get(item.id) ?? { ...item, order: position },
            ),
          );
          this.categoryBusy.set(false);
        },
        error: (error) => {
          this.categoryFailed(error);
          this.loadCategories();
        },
      });
  }

  private categoryFailed(error: unknown): void {
    this.categoryBusy.set(false);
    const conflict = (error as { status?: number } | null)?.status === 409;
    this.toast.error(
      this.localization.translate(
        conflict ? "billing.categories.duplicate" : "billing.saveError",
      ),
    );
  }

  // ---- User rates

  private loadRates(): void {
    forkJoin({ users: this.references.users(), rates: this.api.listRates() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ users, rates }) => {
          this.users.set(
            users.map((item) => ({
              id: item.userId,
              name:
                [item.user.firstName, item.user.lastName]
                  .filter(Boolean)
                  .join(" ") || item.user.email,
            })),
          );
          this.rates.set(rates);
          this.ratesLoading.set(false);
        },
        error: (error) => {
          this.ratesLoading.set(false);
          // 403 means the role may not read rates; show the empty state, not an error.
          if (!isForbidden(error)) this.ratesError.set(true);
        },
      });
  }

  rateLabel(rate: UserRate): string {
    return formatMoney(
      rate.hourlyValue,
      rate.currency,
      this.localization.language(),
    );
  }

  dateLabel(value: string): string {
    return formatDate(value, this.localization.language());
  }

  openRateForm(userId: string): void {
    this.rateUserId.set(userId);
    this.rateForm.reset({
      hourlyValue: "",
      effectiveFrom: officeToday(),
    });
  }

  closeRateForm(): void {
    this.rateUserId.set(null);
  }

  submitRate(): void {
    const userId = this.rateUserId();
    if (!userId) return;
    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }
    const value = this.rateForm.getRawValue();
    this.rateSaving.set(true);
    this.api
      .createRate({
        userId,
        hourlyValue: normalizeMoney(value.hourlyValue) ?? "0",
        currency: this.savedCurrency(),
        effectiveFrom: value.effectiveFrom,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.rates.update((items) => [...items, created]);
          this.rateSaving.set(false);
          this.rateUserId.set(null);
          this.toast.success(this.localization.translate("billing.saved"));
        },
        error: () => {
          this.rateSaving.set(false);
          this.toast.error(this.localization.translate("billing.saveError"));
        },
      });
  }
}
