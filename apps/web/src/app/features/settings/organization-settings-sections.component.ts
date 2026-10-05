import {
  Component,
  DestroyRef,
  computed,
  effect,
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
import { OrganizationSettingsApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmField,
  HlmFieldDescription,
  HlmFieldLabel,
} from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { Observable, finalize } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  CURRENCY_OPTIONS,
  CurrencyCode,
  createCurrencyItemToString,
} from "../../shared/currency";
import { SelectOption, createSelectItemToString } from "../../shared/utils";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { OrganizationSettingsStore } from "./organization-settings.store";

const baseImports = [
  ReactiveFormsModule,
  HlmButton,
  HlmField,
  HlmFieldLabel,
  HlmInput,
  HlmSpinner,
  TranslatePipe,
];
const field = `class="grid gap-4 md:grid-cols-2"`;

abstract class SectionBase {
  protected readonly api = inject(OrganizationSettingsApiClient);
  protected readonly store = inject(OrganizationSettingsStore);
  protected readonly toast = inject(ToastService);
  protected readonly localization = inject(LocalizationService);
  protected readonly destroyRef = inject(DestroyRef);
  readonly saving = signal(false);
  readonly loading = this.store.loading;
  readonly loadError = this.store.error;
  protected constructor() {
    this.store.load();
  }
  protected persist<T>(request: Observable<T>): void {
    this.saving.set(true);
    request
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () =>
          this.toast.success(
            this.localization.translate("settings.organization.saved"),
          ),
        error: () =>
          this.toast.error(
            this.localization.translate("settings.organization.saveError"),
          ),
      });
  }
}

@Component({
  selector: "law-company-settings",
  standalone: true,
  imports: baseImports,
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.company.title" | translate }}
      </h3>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ "settings.organization.company.description" | translate }}
      </p>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <div ${field}>
            @for (f of fields; track f.key) {
              <div hlmField>
                <label hlmFieldLabel [for]="'company-' + f.key">
                  {{ f.label | translate }}
                </label>
                <input
                  hlmInput
                  [id]="'company-' + f.key"
                  [type]="inputType(f.key)"
                  [formControlName]="f.key"
                />
              </div>
            }
          </div>
          <div class="flex justify-end gap-2">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || form.invalid || form.pristine"
            >
              {{
                (saving() ? "settings.saving" : "settings.saveChanges")
                  | translate
              }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class CompanySettingsComponent extends SectionBase {
  readonly fields = [
    { key: "legalName", label: "settings.organization.company.legalName" },
    { key: "displayName", label: "settings.organization.company.displayName" },
    { key: "taxId", label: "settings.organization.company.taxId" },
    {
      key: "registrationNumber",
      label: "settings.organization.company.registrationNumber",
    },
    {
      key: "addressLine1",
      label: "settings.organization.company.addressLine1",
    },
    {
      key: "addressLine2",
      label: "settings.organization.company.addressLine2",
    },
    { key: "city", label: "settings.organization.company.city" },
    { key: "postalCode", label: "settings.organization.company.postalCode" },
    { key: "countryCode", label: "settings.organization.company.countryCode" },
    {
      key: "email",
      label: "settings.organization.company.email",
      type: "email",
    },
    { key: "phone", label: "settings.organization.company.phone", type: "tel" },
    {
      key: "website",
      label: "settings.organization.company.website",
      type: "url",
    },
    { key: "jbkjs", label: "settings.organization.company.jbkjs" },
  ] as const;
  readonly form = new FormGroup(
    Object.fromEntries(
      this.fields.map((item) => [
        item.key,
        new FormControl(item.key === "countryCode" ? "RS" : "", {
          nonNullable: true,
          validators:
            item.key === "countryCode"
              ? [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]
              : [],
        }),
      ]),
    ) as Record<(typeof this.fields)[number]["key"], FormControl<string>>,
  );
  inputType(key: string): string {
    return key === "email"
      ? "email"
      : key === "phone"
        ? "tel"
        : key === "website"
          ? "url"
          : "text";
  }
  constructor() {
    super();
    effect(() => {
      const value = this.store.settings()?.company;
      if (value && this.form.pristine)
        this.form.patchValue(
          Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, v ?? ""]),
          ) as never,
        );
    });
  }
  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.persist(
      this.store
        .update(
          "company",
          this.api.updateCompany(
            Object.fromEntries(
              Object.entries(this.form.getRawValue()).map(([k, v]) => [
                k,
                k === "countryCode" ? v : v || null,
              ]),
            ) as never,
          ),
        )
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
}

@Component({
  selector: "law-tax-settings",
  standalone: true,
  imports: [...baseImports, HlmFieldDescription, HlmSwitch, HlmTextarea],
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.tax.title" | translate }}
      </h3>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <div class="flex items-center justify-between gap-4">
            <label for="vat-registered" class="text-sm font-medium">
              {{ "settings.organization.tax.vatRegistered" | translate }}
            </label>
            <hlm-switch id="vat-registered" formControlName="vatRegistered" />
          </div>
          <div ${field}>
            <div hlmField>
              <label hlmFieldLabel for="vat-rates">
                {{ "settings.organization.tax.availableVatRates" | translate }}
              </label>
              <input
                hlmInput
                id="vat-rates"
                formControlName="availableVatRates"
              />
              <p hlmFieldDescription>
                {{ "settings.organization.tax.ratesHint" | translate }}
              </p>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="default-vat">
                {{ "settings.organization.tax.defaultVatRate" | translate }}
              </label>
              <input
                hlmInput
                id="default-vat"
                type="number"
                formControlName="defaultVatRate"
                [disabled]="!form.controls.vatRegistered.value"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="tax-category">
                {{ "settings.organization.tax.category" | translate }}
              </label>
              <input
                hlmInput
                id="tax-category"
                formControlName="defaultTaxCategoryCode"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="tax-exemption-code">
                {{ "settings.organization.tax.exemptionCode" | translate }}
              </label>
              <input
                hlmInput
                id="tax-exemption-code"
                formControlName="defaultTaxExemptionReasonCode"
              />
            </div>
          </div>
          <div hlmField>
            <label hlmFieldLabel for="tax-exemption-text">
              {{ "settings.organization.tax.exemptionText" | translate }}
            </label>
            <textarea
              hlmTextarea
              id="tax-exemption-text"
              formControlName="defaultTaxExemptionReasonText"
            ></textarea>
          </div>
          <div class="flex items-center justify-between gap-4">
            <label for="cash-accounting" class="text-sm font-medium">
              {{ "settings.organization.tax.cashAccounting" | translate }}
            </label>
            <hlm-switch
              id="cash-accounting"
              formControlName="cashAccountingEnabled"
            />
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || form.invalid || form.pristine"
            >
              {{
                (saving() ? "settings.saving" : "settings.saveChanges")
                  | translate
              }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class TaxSettingsComponent extends SectionBase {
  readonly form = new FormGroup({
    vatRegistered: new FormControl(false, { nonNullable: true }),
    defaultVatRate: new FormControl<number | null>(null),
    availableVatRates: new FormControl("0, 10, 20", {
      nonNullable: true,
      validators: Validators.required,
    }),
    defaultTaxCategoryCode: new FormControl("", { nonNullable: true }),
    defaultTaxExemptionReasonCode: new FormControl("", { nonNullable: true }),
    defaultTaxExemptionReasonText: new FormControl("", { nonNullable: true }),
    cashAccountingEnabled: new FormControl(false, { nonNullable: true }),
  });
  constructor() {
    super();
    effect(() => {
      const v = this.store.settings()?.tax;
      if (v && this.form.pristine)
        this.form.patchValue({
          ...v,
          availableVatRates: v.availableVatRates.join(", "),
          defaultTaxCategoryCode: v.defaultTaxCategoryCode ?? "",
          defaultTaxExemptionReasonCode: v.defaultTaxExemptionReasonCode ?? "",
          defaultTaxExemptionReasonText: v.defaultTaxExemptionReasonText ?? "",
        });
    });
  }
  save() {
    const v = this.form.getRawValue();
    const rates = v.availableVatRates
      .split(",")
      .map(Number)
      .filter(Number.isFinite);
    this.persist(
      this.store
        .update(
          "tax",
          this.api.updateTax({
            ...v,
            availableVatRates: rates,
            defaultTaxCategoryCode: v.defaultTaxCategoryCode || null,
            defaultTaxExemptionReasonCode:
              v.defaultTaxExemptionReasonCode || null,
            defaultTaxExemptionReasonText:
              v.defaultTaxExemptionReasonText || null,
          }),
        )
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
}

@Component({
  selector: "law-numbering-settings",
  standalone: true,
  imports: [...baseImports, HlmFieldDescription, HlmSwitch],
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.numbering.title" | translate }}
      </h3>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ "settings.organization.numbering.description" | translate }}
      </p>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <div hlmField>
            <label hlmFieldLabel for="number-pattern">
              {{ "settings.organization.numbering.pattern" | translate }}
            </label>
            <input hlmInput id="number-pattern" formControlName="pattern" />
            <p hlmFieldDescription>
              {{ "settings.organization.numbering.patternHint" | translate }}
            </p>
          </div>
          <div class="flex flex-col gap-3">
            <div>
              <p class="text-sm font-medium">
                {{ "settings.organization.numbering.tokens" | translate }}
              </p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ "settings.organization.numbering.tokensHint" | translate }}
              </p>
            </div>
            <div class="flex flex-col gap-2">
              @for (item of tokens; track item.token) {
                <div
                  class="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <button
                    hlmBtn
                    type="button"
                    variant="outline"
                    size="sm"
                    class="shrink-0 font-mono"
                    (click)="append(item.token)"
                  >
                    {{ item.token }}
                  </button>
                  <p class="pt-1 text-sm leading-snug text-muted-foreground">
                    {{ item.description | translate }}
                  </p>
                </div>
              }
            </div>
          </div>
          <div ${field}>
            <div hlmField>
              <label hlmFieldLabel for="reset-policy">
                {{ "settings.organization.numbering.resetPolicy" | translate }}
              </label>
              <select
                id="reset-policy"
                formControlName="resetPolicy"
                class="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="NEVER">
                  {{ "settings.organization.numbering.never" | translate }}
                </option>
                <option value="YEARLY">
                  {{ "settings.organization.numbering.yearly" | translate }}
                </option>
                <option value="MONTHLY">
                  {{ "settings.organization.numbering.monthly" | translate }}
                </option>
              </select>
            </div>
            <div></div>
            <div hlmField>
              <label hlmFieldLabel for="start-sequence">
                {{
                  "settings.organization.numbering.startingSequence" | translate
                }}
              </label>
              <input
                hlmInput
                id="start-sequence"
                type="number"
                formControlName="startingSequence"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="increment-by">
                {{ "settings.organization.numbering.incrementBy" | translate }}
              </label>
              <input
                hlmInput
                id="increment-by"
                type="number"
                formControlName="incrementBy"
              />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <label for="manual-override" class="text-sm font-medium">
              {{ "settings.organization.numbering.manualOverride" | translate }}
            </label>
            <hlm-switch
              id="manual-override"
              formControlName="allowManualOverride"
            />
          </div>
          <div class="rounded-lg border border-border bg-muted p-4">
            <p class="text-sm text-muted-foreground">
              {{ "settings.organization.numbering.preview" | translate }}
            </p>
            <strong class="mt-1 block break-all font-mono text-base">
              {{ preview() }}
            </strong>
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || form.invalid || form.pristine"
            >
              {{
                (saving() ? "settings.saving" : "settings.saveChanges")
                  | translate
              }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class InvoiceNumberingSettingsComponent extends SectionBase {
  readonly tokens = [
    {
      token: "{YYYY}",
      description: "settings.organization.numbering.tokenDescriptions.YYYY",
    },
    {
      token: "{YY}",
      description: "settings.organization.numbering.tokenDescriptions.YY",
    },
    {
      token: "{MM}",
      description: "settings.organization.numbering.tokenDescriptions.MM",
    },
    {
      token: "{M}",
      description: "settings.organization.numbering.tokenDescriptions.M",
    },
    {
      token: "{DD}",
      description: "settings.organization.numbering.tokenDescriptions.DD",
    },
    {
      token: "{D}",
      description: "settings.organization.numbering.tokenDescriptions.D",
    },
    {
      token: "{SEQ}",
      description: "settings.organization.numbering.tokenDescriptions.SEQ",
    },
    {
      token: "{SEQ:6}",
      description: "settings.organization.numbering.tokenDescriptions.SEQ6",
    },
  ];
  readonly revision = signal(0);
  readonly form = new FormGroup({
    pattern: new FormControl("{YYYY}-{SEQ:6}", {
      nonNullable: true,
      validators: Validators.required,
    }),
    startingSequence: new FormControl(1, {
      nonNullable: true,
      validators: Validators.min(1),
    }),
    incrementBy: new FormControl(1, {
      nonNullable: true,
      validators: Validators.min(1),
    }),
    resetPolicy: new FormControl<"NEVER" | "YEARLY" | "MONTHLY">("YEARLY", {
      nonNullable: true,
    }),
    allowManualOverride: new FormControl(true, { nonNullable: true }),
  });
  readonly preview = computed(() => {
    this.revision();
    const v = this.form.getRawValue();
    return renderInvoiceNumberPreview(
      v.pattern,
      new Date(),
      v.startingSequence,
    );
  });
  constructor() {
    super();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.revision.update((n) => n + 1));
    effect(() => {
      const v = this.store.settings()?.invoiceNumbering;
      if (v && this.form.pristine) this.form.patchValue(v);
    });
  }
  append(token: string) {
    this.form.controls.pattern.setValue(
      this.form.controls.pattern.value + token,
    );
  }
  save() {
    this.persist(
      this.store
        .update(
          "invoiceNumbering",
          this.api.updateInvoiceNumbering(this.form.getRawValue()),
        )
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
}

export function renderInvoiceNumberPreview(
  pattern: string,
  date: Date,
  sequence: number,
): string {
  const seq = String(sequence);
  return pattern
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, "0"))
    .replace(/\{M\}/g, String(date.getMonth() + 1))
    .replace(/\{DD\}/g, String(date.getDate()).padStart(2, "0"))
    .replace(/\{D\}/g, String(date.getDate()))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, n) =>
      n ? seq.padStart(Number(n), "0") : seq,
    );
}

@Component({
  selector: "law-sef-settings",
  standalone: true,
  imports: [...baseImports, HlmSwitch],
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.sef.title" | translate }}
      </h3>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ "settings.organization.sef.description" | translate }}
      </p>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="saveSettings()"
        >
          <div class="flex items-center justify-between gap-4">
            <label for="sef-enabled" class="text-sm font-medium">
              {{ "settings.organization.sef.enabled" | translate }}
            </label>
            <hlm-switch id="sef-enabled" formControlName="enabled" />
          </div>
          <div hlmField>
            <label hlmFieldLabel for="sef-environment">
              {{ "settings.organization.sef.environment" | translate }}
            </label>
            <select
              id="sef-environment"
              formControlName="environment"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="DEMO">Demo</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </div>
          <div class="flex justify-end">
            <button hlmBtn type="submit" [disabled]="saving() || form.pristine">
              {{ "settings.saveChanges" | translate }}
            </button>
          </div>
        </form>
        <div class="my-6 border-t border-border"></div>
        <section>
          <h4 class="text-sm font-semibold">
            {{ "settings.organization.sef.apiKey" | translate }}
          </h4>
          <p class="mt-1 text-sm text-muted-foreground">
            {{
              (hasApiKey()
                ? "settings.organization.sef.keyConfigured"
                : "settings.organization.sef.keyMissing"
              ) | translate
            }}
          </p>
          <form
            class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            [formGroup]="keyForm"
            (ngSubmit)="replaceKey()"
          >
            <div hlmField class="flex-1">
              <label hlmFieldLabel for="sef-api-key">
                {{ "settings.organization.sef.replaceKey" | translate }}
              </label>
              <input
                hlmInput
                id="sef-api-key"
                type="password"
                autocomplete="new-password"
                formControlName="apiKey"
              />
            </div>
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || keyForm.invalid"
            >
              {{ "settings.organization.sef.saveKey" | translate }}
            </button>
            @if (hasApiKey()) {
              <button
                hlmBtn
                type="button"
                variant="destructive"
                [disabled]="saving()"
                (click)="removeKey()"
              >
                {{ "settings.organization.sef.removeKey" | translate }}
              </button>
            }
          </form>
        </section>
        <div class="my-6 border-t border-border"></div>
        <form
          class="flex flex-col gap-5"
          [formGroup]="attachments"
          (ngSubmit)="saveAttachments()"
        >
          <h4 class="text-sm font-semibold">
            {{ "settings.organization.sef.attachments" | translate }}
          </h4>
          <div class="flex items-center justify-between gap-4">
            <label for="include-pdf" class="text-sm">
              {{ "settings.organization.sef.includePdf" | translate }}
            </label>
            <hlm-switch
              id="include-pdf"
              formControlName="includeGeneratedInvoicePdf"
            />
          </div>
          <div class="flex items-center justify-between gap-4">
            <label for="include-files" class="text-sm">
              {{ "settings.organization.sef.includeFiles" | translate }}
            </label>
            <hlm-switch
              id="include-files"
              formControlName="includeUserAttachments"
            />
          </div>
          <div ${field}>
            <div hlmField>
              <label hlmFieldLabel for="file-extensions">
                {{ "settings.organization.sef.extensions" | translate }}
              </label>
              <input
                hlmInput
                id="file-extensions"
                formControlName="allowedFileExtensions"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="max-files">
                {{ "settings.organization.sef.maxCount" | translate }}
              </label>
              <input
                hlmInput
                id="max-files"
                type="number"
                formControlName="maxAttachmentCount"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="max-file-size">
                {{ "settings.organization.sef.maxSize" | translate }}
              </label>
              <input
                hlmInput
                id="max-file-size"
                type="number"
                formControlName="maxSingleFileSizeMb"
              />
            </div>
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || attachments.pristine"
            >
              {{ "settings.saveChanges" | translate }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class SefSettingsComponent extends SectionBase {
  readonly hasApiKey = signal(false);
  readonly form = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    environment: new FormControl<"DEMO" | "PRODUCTION">("DEMO", {
      nonNullable: true,
    }),
  });
  readonly keyForm = new FormGroup({
    apiKey: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
  readonly attachments = new FormGroup({
    includeGeneratedInvoicePdf: new FormControl(false, { nonNullable: true }),
    includeUserAttachments: new FormControl(true, { nonNullable: true }),
    allowedFileExtensions: new FormControl("", { nonNullable: true }),
    maxAttachmentCount: new FormControl<number | null>(null),
    maxSingleFileSizeMb: new FormControl<number | null>(null),
  });
  constructor() {
    super();
    effect(() => {
      const s = this.store.settings();
      if (!s) return;
      this.hasApiKey.set(s.sef.hasApiKey);
      if (this.form.pristine) this.form.patchValue(s.sef);
      if (this.attachments.pristine)
        this.attachments.patchValue({
          ...s.sefAttachments,
          allowedFileExtensions:
            s.sefAttachments.allowedFileExtensions.join(", "),
        });
    });
  }
  saveSettings() {
    this.persist(
      this.store
        .update("sef", this.api.updateSef(this.form.getRawValue()))
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
  replaceKey() {
    if (this.keyForm.invalid) return;
    this.saving.set(true);
    this.api
      .replaceSefApiKey(this.keyForm.controls.apiKey.value)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (s) => {
          this.hasApiKey.set(s.hasApiKey);
          this.keyForm.reset();
          this.toast.success(
            this.localization.translate("settings.organization.saved"),
          );
        },
        error: () =>
          this.toast.error(
            this.localization.translate("settings.organization.saveError"),
          ),
      });
  }
  removeKey() {
    this.saving.set(true);
    this.api
      .removeSefApiKey()
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (s) => this.hasApiKey.set(s.hasApiKey),
        error: () =>
          this.toast.error(
            this.localization.translate("settings.organization.saveError"),
          ),
      });
  }
  saveAttachments() {
    const v = this.attachments.getRawValue();
    this.persist(
      this.store
        .update(
          "sefAttachments",
          this.api.updateSefAttachments({
            ...v,
            allowedFileExtensions: v.allowedFileExtensions
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          }),
        )
        .pipe(finalize(() => this.attachments.markAsPristine())),
    );
  }
}

@Component({
  selector: "law-payment-settings",
  standalone: true,
  imports: [...baseImports, HlmSwitch],
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.payment.title" | translate }}
      </h3>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <div ${field}>
            <div hlmField>
              <label hlmFieldLabel for="payment-days">
                {{ "settings.organization.payment.termDays" | translate }}
              </label>
              <input
                hlmInput
                id="payment-days"
                type="number"
                formControlName="defaultPaymentTermDays"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="payment-method">
                {{ "settings.organization.payment.method" | translate }}
              </label>
              <select
                id="payment-method"
                formControlName="defaultPaymentMethod"
                class="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                @for (m of methods; track m) {
                  <option [value]="m">
                    {{
                      "settings.organization.payment.methods." + m | translate
                    }}
                  </option>
                }
              </select>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="payment-model">
                {{ "settings.organization.payment.model" | translate }}
              </label>
              <input
                hlmInput
                id="payment-model"
                formControlName="defaultPaymentModel"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="payment-reference">
                {{ "settings.organization.payment.reference" | translate }}
              </label>
              <input
                hlmInput
                id="payment-reference"
                formControlName="paymentReferencePattern"
              />
            </div>
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || form.invalid || form.pristine"
            >
              {{ "settings.saveChanges" | translate }}
            </button>
          </div>
        </form>
        <div class="my-6 border-t border-border"></div>
        <h4 class="text-sm font-semibold">
          {{ "settings.organization.payment.bankAccounts" | translate }}
        </h4>
        <div class="mt-3 space-y-2">
          @for (account of accounts(); track account.id) {
            <div
              class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <strong class="text-sm">{{ account.name }}</strong>
                <p class="text-sm text-muted-foreground">
                  {{ account.accountNumber || account.iban }} ·
                  {{ account.currencyCode }}
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  hlmBtn
                  type="button"
                  variant="outline"
                  (click)="editAccount(account)"
                >
                  {{ "settings.organization.payment.edit" | translate }}
                </button>
                <button
                  hlmBtn
                  type="button"
                  variant="outline"
                  (click)="archive(account.id)"
                >
                  {{ "settings.organization.payment.archive" | translate }}
                </button>
              </div>
            </div>
          }
        </div>
        <form
          class="mt-5 grid gap-4 md:grid-cols-2"
          [formGroup]="accountForm"
          (ngSubmit)="addAccount()"
        >
          <div hlmField>
            <label hlmFieldLabel for="account-name">
              {{ "settings.organization.payment.accountName" | translate }}
            </label>
            <input hlmInput id="account-name" formControlName="name" />
          </div>
          <div hlmField>
            <label hlmFieldLabel for="bank-name">
              {{ "settings.organization.payment.bankName" | translate }}
            </label>
            <input hlmInput id="bank-name" formControlName="bankName" />
          </div>
          <div hlmField>
            <label hlmFieldLabel for="account-number">
              {{ "settings.organization.payment.accountNumber" | translate }}
            </label>
            <input
              hlmInput
              id="account-number"
              formControlName="accountNumber"
            />
          </div>
          <div hlmField>
            <label hlmFieldLabel for="iban">IBAN</label>
            <input hlmInput id="iban" formControlName="iban" />
          </div>
          <div hlmField>
            <label hlmFieldLabel for="swift">SWIFT/BIC</label>
            <input hlmInput id="swift" formControlName="swiftBic" />
          </div>
          <div hlmField>
            <label hlmFieldLabel for="account-currency">
              {{ "settings.organization.currency.default" | translate }}
            </label>
            <input
              hlmInput
              id="account-currency"
              formControlName="currencyCode"
            />
          </div>
          <div class="flex items-center gap-3">
            <hlm-switch id="account-default" formControlName="isDefault" />
            <label for="account-default" class="text-sm">
              {{ "settings.organization.payment.defaultAccount" | translate }}
            </label>
          </div>
          <div class="flex justify-end gap-2">
            @if (editingAccountId()) {
              <button
                hlmBtn
                type="button"
                variant="outline"
                (click)="cancelAccountEdit()"
              >
                {{ "settings.organization.payment.cancelEdit" | translate }}
              </button>
            }
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || accountForm.invalid"
            >
              {{
                (editingAccountId()
                  ? "settings.organization.payment.saveAccount"
                  : "settings.organization.payment.addAccount"
                ) | translate
              }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class PaymentSettingsComponent extends SectionBase {
  readonly methods = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"] as const;
  readonly accounts = computed(() => this.store.settings()?.bankAccounts ?? []);
  readonly editingAccountId = signal<string | null>(null);
  readonly form = new FormGroup({
    defaultPaymentTermDays: new FormControl(15, {
      nonNullable: true,
      validators: Validators.min(0),
    }),
    defaultPaymentMethod: new FormControl<(typeof this.methods)[number]>(
      "BANK_TRANSFER",
      { nonNullable: true },
    ),
    defaultPaymentModel: new FormControl("", { nonNullable: true }),
    paymentReferencePattern: new FormControl("", { nonNullable: true }),
  });
  readonly accountForm = new FormGroup({
    name: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    bankName: new FormControl("", { nonNullable: true }),
    accountNumber: new FormControl("", { nonNullable: true }),
    iban: new FormControl("", { nonNullable: true }),
    swiftBic: new FormControl("", { nonNullable: true }),
    currencyCode: new FormControl("RSD", {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Z]{3}$/)],
    }),
    isDefault: new FormControl(false, { nonNullable: true }),
  });
  constructor() {
    super();
    effect(() => {
      const v = this.store.settings()?.payment;
      if (v && this.form.pristine)
        this.form.patchValue({
          ...v,
          defaultPaymentModel: v.defaultPaymentModel ?? "",
          paymentReferencePattern: v.paymentReferencePattern ?? "",
        });
    });
  }
  save() {
    const v = this.form.getRawValue();
    this.persist(
      this.store
        .update(
          "payment",
          this.api.updatePayment({
            ...v,
            defaultPaymentModel: v.defaultPaymentModel || null,
            paymentReferencePattern: v.paymentReferencePattern || null,
          }),
        )
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
  addAccount() {
    if (this.accountForm.invalid) return;
    const v = this.accountForm.getRawValue();
    this.saving.set(true);
    const body = {
      ...v,
      bankName: v.bankName || null,
      accountNumber: v.accountNumber || null,
      iban: v.iban || null,
      swiftBic: v.swiftBic || null,
      active: true,
    };
    const editingId = this.editingAccountId();
    const request = editingId
      ? this.api.updateBankAccount(editingId, body)
      : this.api.createBankAccount(body);
    request
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.cancelAccountEdit();
          this.store.refresh();
        },
        error: () =>
          this.toast.error(
            this.localization.translate("settings.organization.saveError"),
          ),
      });
  }
  editAccount(account: {
    id: string;
    name: string;
    bankName: string | null;
    accountNumber: string | null;
    iban: string | null;
    swiftBic: string | null;
    currencyCode: string;
    isDefault: boolean;
  }) {
    this.editingAccountId.set(account.id);
    this.accountForm.patchValue({
      ...account,
      bankName: account.bankName ?? "",
      accountNumber: account.accountNumber ?? "",
      iban: account.iban ?? "",
      swiftBic: account.swiftBic ?? "",
    });
  }
  cancelAccountEdit() {
    this.editingAccountId.set(null);
    this.accountForm.reset({
      name: "",
      bankName: "",
      accountNumber: "",
      iban: "",
      swiftBic: "",
      currencyCode: "RSD",
      isDefault: false,
    });
  }
  archive(id: string) {
    this.api
      .archiveBankAccount(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.store.refresh());
  }
}

@Component({
  selector: "law-currency-settings",
  standalone: true,
  imports: [...baseImports, HlmFieldDescription, HlmSelectImports, HlmSwitch],
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.currency.title" | translate }}
      </h3>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <div class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel for="default-currency">
                {{ "settings.organization.currency.default" | translate }}
              </label>
              <hlm-select
                formControlName="defaultCurrencyCode"
                [itemToString]="currencyItemToString"
              >
                <hlm-select-trigger buttonId="default-currency" class="w-full">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  <hlm-select-group>
                    @for (currency of currencies; track currency.value) {
                      <hlm-select-item [value]="currency.value">
                        {{ currency.label | translate }}
                      </hlm-select-item>
                    }
                  </hlm-select-group>
                </hlm-select-content>
              </hlm-select>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="allowed-currencies">
                {{ "settings.organization.currency.allowed" | translate }}
              </label>
              <hlm-select-multiple
                formControlName="allowedCurrencyCodes"
                [itemToString]="currencyItemToString"
              >
                <hlm-select-trigger
                  buttonId="allowed-currencies"
                  class="w-full"
                >
                  <hlm-select-placeholder>
                    {{
                      "settings.organization.currency.allowedPlaceholder"
                        | translate
                    }}
                  </hlm-select-placeholder>
                  <ng-template hlmSelectValues let-values>
                    <hlm-select-values-content>
                      {{ currencyItemToString(values[0]) }}
                      @if (values.length > 1) {
                        <span>
                          {{
                            "settings.organization.currency.moreSelected"
                              | translate: { count: values.length - 1 }
                          }}
                        </span>
                      }
                    </hlm-select-values-content>
                  </ng-template>
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  <hlm-select-group>
                    @for (currency of currencies; track currency.value) {
                      <hlm-select-item [value]="currency.value">
                        {{ currency.label | translate }}
                      </hlm-select-item>
                    }
                  </hlm-select-group>
                </hlm-select-content>
              </hlm-select-multiple>
              <p hlmFieldDescription>
                {{ "settings.organization.currency.allowedHint" | translate }}
              </p>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="rate-source">
                {{ "settings.organization.currency.source" | translate }}
              </label>
              <hlm-select
                formControlName="exchangeRateSource"
                [itemToString]="sourceItemToString"
              >
                <hlm-select-trigger buttonId="rate-source" class="w-full">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  <hlm-select-group>
                    @for (source of sources; track source.value) {
                      <hlm-select-item [value]="source.value">
                        {{ source.label | translate }}
                      </hlm-select-item>
                    }
                  </hlm-select-group>
                </hlm-select-content>
              </hlm-select>
            </div>
          </div>
          <div class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel for="rate-precision">
                {{ "settings.organization.currency.ratePrecision" | translate }}
              </label>
              <input
                hlmInput
                id="rate-precision"
                type="number"
                formControlName="exchangeRatePrecision"
              />
              <p hlmFieldDescription>
                {{
                  "settings.organization.currency.ratePrecisionHint" | translate
                }}
              </p>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="amount-precision">
                {{
                  "settings.organization.currency.amountPrecision" | translate
                }}
              </label>
              <input
                hlmInput
                id="amount-precision"
                type="number"
                formControlName="amountPrecision"
              />
              <p hlmFieldDescription>
                {{
                  "settings.organization.currency.amountPrecisionHint"
                    | translate
                }}
              </p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <label for="manual-rate" class="text-sm font-medium">
              {{ "settings.organization.currency.manualRate" | translate }}
            </label>
            <hlm-switch
              id="manual-rate"
              formControlName="allowManualExchangeRate"
            />
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || form.invalid || form.pristine"
            >
              {{ "settings.saveChanges" | translate }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class CurrencySettingsComponent extends SectionBase {
  readonly currencies = CURRENCY_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );
  readonly sources = [
    {
      value: "NBS_MIDDLE",
      label: "settings.organization.currency.sources.NBS_MIDDLE",
    },
    {
      value: "NBS_BUY",
      label: "settings.organization.currency.sources.NBS_BUY",
    },
    {
      value: "NBS_SELL",
      label: "settings.organization.currency.sources.NBS_SELL",
    },
    {
      value: "MANUAL",
      label: "settings.organization.currency.sources.MANUAL",
    },
  ] as const satisfies ReadonlyArray<
    SelectOption<"NBS_MIDDLE" | "NBS_BUY" | "NBS_SELL" | "MANUAL">
  >;
  readonly sourceItemToString = createSelectItemToString(this.sources, (key) =>
    this.localization.translate(key),
  );
  readonly form = new FormGroup({
    defaultCurrencyCode: new FormControl<CurrencyCode>("RSD", {
      nonNullable: true,
      validators: Validators.required,
    }),
    allowedCurrencyCodes: new FormControl<CurrencyCode[]>(["RSD"], {
      nonNullable: true,
      validators: Validators.required,
    }),
    exchangeRateSource: new FormControl<(typeof this.sources)[number]["value"]>(
      "NBS_MIDDLE",
      { nonNullable: true },
    ),
    allowManualExchangeRate: new FormControl(true, { nonNullable: true }),
    exchangeRatePrecision: new FormControl(4, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(12)],
    }),
    amountPrecision: new FormControl(2, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(6)],
    }),
  });
  constructor() {
    super();
    effect(() => {
      const v = this.store.settings()?.currency;
      if (v && this.form.pristine) {
        const allowedCurrencyCodes =
          v.allowedCurrencyCodes.filter(isCurrencyCode);
        this.form.patchValue({
          ...v,
          defaultCurrencyCode: isCurrencyCode(v.defaultCurrencyCode)
            ? v.defaultCurrencyCode
            : "RSD",
          allowedCurrencyCodes:
            allowedCurrencyCodes.length > 0 ? allowedCurrencyCodes : ["RSD"],
        });
      }
    });
  }
  save() {
    const v = this.form.getRawValue();
    this.persist(
      this.store
        .update(
          "currency",
          this.api.updateCurrency({
            ...v,
            allowedCurrencyCodes: v.allowedCurrencyCodes,
          }),
        )
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
}

function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCY_OPTIONS.some((option) => option.value === value);
}

@Component({
  selector: "law-invoice-defaults-settings",
  standalone: true,
  imports: [...baseImports, HlmTextarea],
  template: `
    <section class="py-6">
      <h3 class="text-base font-semibold">
        {{ "settings.organization.invoiceDefaults.title" | translate }}
      </h3>
      @if (loading()) {
        <hlm-spinner class="mt-6" />
      } @else {
        <form
          class="mt-6 flex flex-col gap-5"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <div ${field}>
            <div hlmField>
              <label hlmFieldLabel for="issue-place">
                {{
                  "settings.organization.invoiceDefaults.issuePlace" | translate
                }}
              </label>
              <input
                hlmInput
                id="issue-place"
                formControlName="defaultIssuePlace"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="invoice-language">
                {{
                  "settings.organization.invoiceDefaults.language" | translate
                }}
              </label>
              <input
                hlmInput
                id="invoice-language"
                formControlName="defaultLanguage"
              />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="unit-measure">
                {{ "settings.organization.invoiceDefaults.unit" | translate }}
              </label>
              <input
                hlmInput
                id="unit-measure"
                formControlName="defaultUnitOfMeasure"
              />
            </div>
          </div>
          <div hlmField>
            <label hlmFieldLabel for="default-note">
              {{ "settings.organization.invoiceDefaults.note" | translate }}
            </label>
            <textarea
              hlmTextarea
              id="default-note"
              formControlName="defaultNote"
            ></textarea>
          </div>
          <div hlmField>
            <label hlmFieldLabel for="footer-text">
              {{ "settings.organization.invoiceDefaults.footer" | translate }}
            </label>
            <textarea
              hlmTextarea
              id="footer-text"
              formControlName="defaultFooterText"
            ></textarea>
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              type="submit"
              [disabled]="saving() || form.invalid || form.pristine"
            >
              {{ "settings.saveChanges" | translate }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class InvoiceDefaultsSettingsComponent extends SectionBase {
  readonly form = new FormGroup({
    defaultIssuePlace: new FormControl("", { nonNullable: true }),
    defaultLanguage: new FormControl("sr-Latn", {
      nonNullable: true,
      validators: Validators.required,
    }),
    defaultUnitOfMeasure: new FormControl("", { nonNullable: true }),
    defaultNote: new FormControl("", { nonNullable: true }),
    defaultFooterText: new FormControl("", { nonNullable: true }),
  });
  constructor() {
    super();
    effect(() => {
      const v = this.store.settings()?.invoiceDefaults;
      if (v && this.form.pristine)
        this.form.patchValue(
          Object.fromEntries(
            Object.entries(v).map(([k, x]) => [k, x ?? ""]),
          ) as never,
        );
    });
  }
  save() {
    const value = Object.fromEntries(
      Object.entries(this.form.getRawValue()).map(([k, v]) => [
        k,
        k === "defaultLanguage" ? v : v || null,
      ]),
    ) as never;
    this.persist(
      this.store
        .update("invoiceDefaults", this.api.updateInvoiceDefaults(value))
        .pipe(finalize(() => this.form.markAsPristine())),
    );
  }
}
