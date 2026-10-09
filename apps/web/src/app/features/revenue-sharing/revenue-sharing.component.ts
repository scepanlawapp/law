import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
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
import { firstValueFrom, forkJoin } from "rxjs";
import { RevenueSharingApiClient } from "@law/api-clients";
import {
  defaultRevenueConfiguration,
  revenueEmptyRates,
  REVENUE_ORIGINS,
  REVENUE_MODES,
  REVENUE_BASES,
  REVENUE_AGREEMENT_TYPES,
  REVENUE_DEPARTURE_POLICIES,
  REVENUE_SCOPES,
  REVENUE_CATEGORIES,
  REVENUE_COMBINATIONS,
  RevenueConfiguration,
  RevenueAgreement,
  RevenueSpecialRule,
  RevenueReferences,
  RevenueSettingsResponse,
  RevenueHistoryEntry,
  RevenuePreviewResult,
  RevenuePreviewScenario,
  RevenueRates,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTabsImports } from "@spartan-ng/helm/tabs";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { SelectOption } from "../../shared/utils";
import {
  RevenueSelectComponent,
  revenueOptions,
} from "./revenue-select.component";
import {
  makeRateForm,
  readRate,
  writeRate,
  RevenueRateComponent,
  RevenueRateForm,
} from "./revenue-rate.component";
import { officeToday } from "../time/time-utils";

const textControl = (value = "", required = false) =>
  new FormControl<string>(value, {
    nonNullable: true,
    validators: required ? [Validators.required] : [],
  });
const booleanControl = (value = false) =>
  new FormControl(value, { nonNullable: true });
const ratesForm = (inherit = false) =>
  new FormGroup(
    Object.fromEntries(
      REVENUE_ORIGINS.map((o) => [o, makeRateForm(inherit)]),
    ) as Record<(typeof REVENUE_ORIGINS)[number], RevenueRateForm>,
  );
const readRates = (form: ReturnType<typeof ratesForm>) =>
  Object.fromEntries(
    REVENUE_ORIGINS.map((o) => [o, readRate(form.controls[o])]),
  ) as RevenueRates;
const writeRates = (form: ReturnType<typeof ratesForm>, rates: RevenueRates) =>
  REVENUE_ORIGINS.forEach((o) => writeRate(form.controls[o], rates[o]));

@Component({
  selector: "law-revenue-sharing",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmSwitch,
    HlmSpinner,
    HlmTabsImports,
    HlmTableImports,
    TranslatePipe,
    RevenueSelectComponent,
    RevenueRateComponent,
  ],
  templateUrl: "./revenue-sharing.component.html",
})
export class RevenueSharingComponent {
  private readonly api = inject(RevenueSharingApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly previewing = signal(false);
  readonly error = signal("");
  readonly previewResult = signal<RevenuePreviewResult | null>(null);
  readonly loaded = signal<RevenueSettingsResponse | null>(null);
  readonly references = signal<RevenueReferences>({
    members: [],
    clients: [],
    cases: [],
    events: [],
  });
  readonly history = signal<RevenueHistoryEntry[]>([]);
  readonly agreements = signal<RevenueAgreement[]>([]);
  readonly rules = signal<RevenueSpecialRule[]>([]);
  readonly draftChanged = signal(false);
  readonly formChanged = signal(false);
  readonly tab = signal("overview");
  readonly tabs = [
    "overview",
    "general",
    "team",
    "special",
    "simulator",
    "history",
  ];
  readonly origins = REVENUE_ORIGINS;
  readonly filter = textControl("ACTIVE");
  readonly filterOptions = revenueOptions(["ACTIVE", "FORMER", "ALL"]);
  readonly filteredMembers = signal<RevenueReferences["members"]>([]);
  readonly modes = revenueOptions(REVENUE_MODES);
  readonly bases = revenueOptions(REVENUE_BASES);
  readonly agreementTypes = revenueOptions(REVENUE_AGREEMENT_TYPES);
  readonly departurePolicies = revenueOptions(REVENUE_DEPARTURE_POLICIES);
  readonly scopeTypes = revenueOptions(REVENUE_SCOPES);
  readonly categories = revenueOptions(REVENUE_CATEGORIES);
  readonly combinations = revenueOptions(REVENUE_COMBINATIONS);
  readonly originOptions = revenueOptions(REVENUE_ORIGINS);
  readonly originOrAny = [
    { value: "", label: "revenue.anyOrigin" },
    ...this.originOptions,
  ];
  readonly selfOptions = revenueOptions(["INHERIT", "YES", "NO"]);
  readonly generalFields = [
    { key: "primaryRevenueBasis" as const, options: this.bases },
    {
      key: "vatBasis" as const,
      options: revenueOptions(["EXCLUDING_VAT", "INCLUDING_VAT"]),
    },
    {
      key: "expenseTreatment" as const,
      options: revenueOptions(["EXCLUDE", "INCLUDE"]),
    },
    {
      key: "partialPaymentPolicy" as const,
      options: revenueOptions(["PROPORTIONAL", "MANUAL"]),
    },
    {
      key: "entitlementDatePolicy" as const,
      options: revenueOptions([
        "WORK_EXECUTION_DATE",
        "INVOICE_DATE",
        "COLLECTION_DATE",
      ]),
    },
    {
      key: "missingRulePolicy" as const,
      options: revenueOptions(["REQUIRES_CONFIGURATION"]),
    },
  ];
  readonly form = new FormGroup({
    enabled: booleanControl(),
    configurationMode: textControl("SHARED_RULES"),
    primaryRevenueBasis: textControl("COLLECTED"),
    vatBasis: textControl("EXCLUDING_VAT"),
    expenseTreatment: textControl("EXCLUDE"),
    partialPaymentPolicy: textControl("PROPORTIONAL"),
    entitlementDatePolicy: textControl("WORK_EXECUTION_DATE"),
    missingRulePolicy: textControl("REQUIRES_CONFIGURATION"),
    rates: ratesForm(),
    originationEnabled: booleanControl(),
    originationRate: makeRateForm(),
    originationOnOthersWork: booleanControl(true),
    selfOrigination: booleanControl(),
    allowPersonalOriginationOverride: booleanControl(),
  });
  readonly publication = new FormGroup({
    effectiveFrom: textControl(officeToday(), true),
    reason: textControl(),
  });
  readonly agreementEditor = new FormGroup({
    id: textControl(),
    memberId: textControl("", true),
    agreementType: textControl("INHERIT"),
    effectiveFrom: textControl(officeToday(), true),
    effectiveTo: textControl(),
    rates: ratesForm(true),
    originationRate: makeRateForm(true),
    selfOrigination: textControl("INHERIT"),
    departurePolicy: textControl("RETAIN_EARNINGS_ON_PRIOR_WORK"),
    departureCutoffDate: textControl(),
    description: textControl(),
  });
  readonly ruleEditor = new FormGroup({
    id: textControl(),
    memberId: textControl("", true),
    scopeType: textControl("FIRM"),
    scopeId: textControl(),
    earningType: textControl("WORK_SHARE"),
    clientOrigin: textControl("OWN_CLIENT"),
    percentage: textControl("", true),
    revenueBasis: textControl("COLLECTED"),
    combinationMode: textControl("OVERRIDE"),
    poolId: textControl(),
    effectiveFrom: textControl(officeToday(), true),
    effectiveTo: textControl(),
    active: booleanControl(true),
    description: textControl(),
  });
  readonly simulator = new FormGroup({
    amount: textControl("", true),
    revenueBasis: textControl("COLLECTED"),
    memberId: textControl("", true),
    clientOrigin: textControl("OWN_CLIENT"),
    originatorId: textControl(),
    referenceDate: textControl(officeToday(), true),
    collectionDate: textControl(),
    clientId: textControl(),
    caseId: textControl(),
    eventId: textControl(),
    agreementId: textControl(),
    specialRuleId: textControl(),
  });
  readonly editingAgreement = signal(false);
  readonly editingRule = signal(false);
  readonly historicalAgreement = signal(false);
  readonly historicalRule = signal(false);
  readonly editorChanged = signal(false);
  readonly dirty = computed(
    () => this.formChanged() || this.draftChanged() || this.editorChanged(),
  );
  readonly individualMode = signal(false);
  readonly advancedMode = signal(false);

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formChanged.set(this.form.dirty);
        this.updateMode();
        this.previewResult.set(null);
      });
    this.publication.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formChanged.set(true));
    this.agreementEditor.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.editorChanged.set(this.agreementEditor.dirty));
    this.ruleEditor.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.editorChanged.set(this.ruleEditor.dirty));
    this.ruleEditor.controls.scopeType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.ruleEditor.controls.scopeId.setValue("", { emitEvent: false }),
      );
    this.simulator.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.previewResult.set(null));
    this.filter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateMembers());
    this.load();
  }
  updateMode() {
    const mode = this.form.controls.configurationMode.value;
    this.individualMode.set(mode !== "SHARED_RULES");
    this.advancedMode.set(mode === "ADVANCED");
  }
  updateMembers() {
    const filter = this.filter.value;
    this.filteredMembers.set(
      this.references().members.filter(
        (m) =>
          filter === "ALL" ||
          (filter === "ACTIVE" ? m.status === "ACTIVE" : m.status === "FORMER"),
      ),
    );
  }
  load() {
    if (this.saving()) return;
    this.loading.set(true);
    this.error.set("");
    forkJoin({
      settings: this.api.get(),
      references: this.api.references(),
      history: this.api.history(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.references.set(data.references);
          this.history.set(data.history);
          this.apply(data.settings);
          this.loading.set(false);
          this.updateMembers();
        },
        error: (e) => {
          this.error.set(this.errorKey(e));
          this.loading.set(false);
        },
      });
  }
  private apply(settings: RevenueSettingsResponse) {
    this.loaded.set(settings);
    const { rates, originationRate, agreements, specialRules, ...policies } =
      settings.configuration;
    this.form.patchValue(policies, { emitEvent: false });
    writeRates(this.form.controls.rates, rates);
    writeRate(this.form.controls.originationRate, originationRate);
    this.agreements.set(structuredClone(agreements));
    this.rules.set(structuredClone(specialRules));
    this.form.markAsPristine();
    this.formChanged.set(false);
    this.draftChanged.set(false);
    this.editorChanged.set(false);
    this.editingAgreement.set(false);
    this.editingRule.set(false);
    this.publication.patchValue(
      {
        effectiveFrom:
          settings.effectiveFrom && settings.effectiveFrom > officeToday()
            ? settings.effectiveFrom
            : officeToday(),
        reason: "",
      },
      { emitEvent: false },
    );
    this.updateMode();
    this.previewResult.set(null);
  }
  configuration(): RevenueConfiguration {
    return {
      ...this.form.getRawValue(),
      rates: readRates(this.form.controls.rates),
      originationRate: readRate(this.form.controls.originationRate),
      agreements: this.agreements(),
      specialRules: this.rules(),
    } as RevenueConfiguration;
  }
  memberName(id: string) {
    return (
      this.references().members.find((m) => m.id === id)?.name ??
      this.localization.translate("revenue.unavailable")
    );
  }
  memberOptions(optional = false): SelectOption[] {
    return [
      ...(optional ? [{ value: "", label: "revenue.none" }] : []),
      ...this.references().members.map((m) => ({ value: m.id, label: m.name })),
    ];
  }
  referenceOptions(
    kind: "clients" | "cases" | "events",
    optional = false,
  ): SelectOption[] {
    return [
      ...(optional ? [{ value: "", label: "revenue.none" }] : []),
      ...this.references()[kind].map((r) => ({ value: r.id, label: r.name })),
    ];
  }
  scopeOptions(): SelectOption[] {
    const scope = this.ruleEditor.controls.scopeType.value;
    return scope === "MEMBER"
      ? this.memberOptions()
      : scope === "CLIENT"
        ? this.referenceOptions("clients")
        : scope === "CASE"
          ? this.referenceOptions("cases")
          : scope === "WORK_EVENT"
            ? this.referenceOptions("events")
            : [];
  }
  scopeName(rule: RevenueSpecialRule) {
    if (rule.scopeType === "FIRM")
      return this.localization.translate("revenue.enum.FIRM");
    if (rule.scopeType === "MEMBER") return this.memberName(rule.scopeId ?? "");
    const list =
      rule.scopeType === "CLIENT"
        ? "clients"
        : rule.scopeType === "CASE"
          ? "cases"
          : "events";
    return (
      this.references()[list].find((r) => r.id === rule.scopeId)?.name ??
      this.localization.translate("revenue.unavailable")
    );
  }
  agreementOptions(): SelectOption[] {
    return [
      { value: "", label: "revenue.automatic" },
      ...this.agreements()
        .filter((a) => a.memberId === this.simulator.controls.memberId.value)
        .map((a) => ({
          value: a.id,
          label: `${this.memberName(a.memberId)} · ${this.date(a.effectiveFrom)}`,
        })),
    ];
  }
  ruleOptions(): SelectOption[] {
    return [
      { value: "", label: "revenue.automatic" },
      ...this.rules()
        .filter((r) => r.active)
        .map((r) => ({
          value: r.id,
          label: `${this.memberName(r.memberId)} · ${this.scopeName(r)} · ${this.localization.translate("revenue.enum." + r.earningType)}`,
        })),
    ];
  }
  agreementsFor(id: string) {
    return this.agreements().filter((a) => a.memberId === id);
  }
  async editAgreement(memberId: string, agreement?: RevenueAgreement) {
    if (this.editorChanged() && !(await this.ask("revenue.discard"))) return;
    this.agreementEditor.enable({ emitEvent: false });
    const a =
      agreement ??
      ({
        id: crypto.randomUUID(),
        memberId,
        agreementType: "UNCONFIGURED",
        effectiveFrom: this.publication.controls.effectiveFrom.value,
        effectiveTo: null,
        rates: revenueEmptyRates(true),
        originationRate: { state: "INHERIT", percentage: null },
        selfOrigination: null,
        departurePolicy: "RETAIN_EARNINGS_ON_PRIOR_WORK",
        departureCutoffDate: null,
        description: "",
      } as RevenueAgreement);
    const {
      rates,
      originationRate,
      selfOrigination,
      effectiveTo,
      departureCutoffDate,
      ...fields
    } = a;
    this.agreementEditor.patchValue(
      {
        ...fields,
        effectiveTo: effectiveTo ?? "",
        departureCutoffDate: departureCutoffDate ?? "",
        selfOrigination:
          selfOrigination === null ? "INHERIT" : selfOrigination ? "YES" : "NO",
      },
      { emitEvent: false },
    );
    writeRates(this.agreementEditor.controls.rates, rates);
    writeRate(this.agreementEditor.controls.originationRate, originationRate);
    const historical = Boolean(
      agreement &&
        agreement.effectiveFrom < this.publication.controls.effectiveFrom.value,
    );
    this.historicalAgreement.set(historical);
    if (historical) {
      this.agreementEditor.disable({ emitEvent: false });
      this.agreementEditor.controls.departurePolicy.enable({
        emitEvent: false,
      });
      this.agreementEditor.controls.departureCutoffDate.enable({
        emitEvent: false,
      });
      this.agreementEditor.controls.description.enable({ emitEvent: false });
      if (!agreement?.effectiveTo)
        this.agreementEditor.controls.effectiveTo.enable({ emitEvent: false });
    }
    this.agreementEditor.markAsPristine();
    this.editorChanged.set(false);
    this.editingAgreement.set(true);
    this.editingRule.set(false);
  }
  stageAgreement() {
    this.agreementEditor.markAllAsTouched();
    if (this.agreementEditor.invalid) {
      this.error.set("revenue.error.INVALID_INPUT");
      return;
    }
    const v = this.agreementEditor.getRawValue();
    const a = {
      ...v,
      rates: readRates(this.agreementEditor.controls.rates),
      originationRate: readRate(this.agreementEditor.controls.originationRate),
      selfOrigination:
        v.selfOrigination === "INHERIT" ? null : v.selfOrigination === "YES",
      effectiveTo: v.effectiveTo || null,
      departureCutoffDate: v.departureCutoffDate || null,
    } as RevenueAgreement;
    this.agreements.update((rows) =>
      rows.some((row) => row.id === a.id)
        ? rows.map((row) => (row.id === a.id ? a : row))
        : [...rows, a],
    );
    this.stageDone();
  }
  async editRule(rule?: RevenueSpecialRule) {
    if (this.editorChanged() && !(await this.ask("revenue.discard"))) return;
    this.ruleEditor.enable({ emitEvent: false });
    const r = rule ?? {
      id: crypto.randomUUID(),
      memberId: "",
      scopeType: "FIRM",
      scopeId: null,
      earningType: "WORK_SHARE",
      clientOrigin: "OWN_CLIENT",
      percentage: "",
      revenueBasis: this.form.controls.primaryRevenueBasis.value,
      combinationMode: "OVERRIDE",
      poolId: null,
      effectiveFrom: this.publication.controls.effectiveFrom.value,
      effectiveTo: null,
      active: true,
      description: "",
    };
    this.ruleEditor.patchValue(
      {
        ...r,
        scopeId: r.scopeId ?? "",
        clientOrigin: r.clientOrigin ?? "",
        poolId: r.poolId ?? "",
        effectiveTo: r.effectiveTo ?? "",
      },
      { emitEvent: false },
    );
    const historical = Boolean(
      rule &&
        rule.effectiveFrom < this.publication.controls.effectiveFrom.value,
    );
    this.historicalRule.set(historical);
    if (historical) {
      this.ruleEditor.disable({ emitEvent: false });
      this.ruleEditor.controls.active.enable({ emitEvent: false });
      if (!rule?.effectiveTo)
        this.ruleEditor.controls.effectiveTo.enable({ emitEvent: false });
    }
    this.ruleEditor.markAsPristine();
    this.editorChanged.set(false);
    this.editingRule.set(true);
    this.editingAgreement.set(false);
  }
  stageRule() {
    this.ruleEditor.markAllAsTouched();
    if (this.ruleEditor.invalid) {
      this.error.set("revenue.error.INVALID_INPUT");
      return;
    }
    const v = this.ruleEditor.getRawValue();
    const r = {
      ...v,
      scopeId:
        v.scopeType === "FIRM"
          ? null
          : v.scopeType === "MEMBER"
            ? v.memberId
            : v.scopeId || null,
      poolId: v.combinationMode === "EXCLUSIVE_SPLIT" ? v.poolId || null : null,
      clientOrigin: v.clientOrigin || null,
      effectiveTo: v.effectiveTo || null,
    } as RevenueSpecialRule;
    this.rules.update((rows) =>
      rows.some((row) => row.id === r.id)
        ? rows.map((row) => (row.id === r.id ? r : row))
        : [...rows, r],
    );
    this.stageDone();
  }
  private stageDone() {
    this.draftChanged.set(true);
    this.editorChanged.set(false);
    this.editingAgreement.set(false);
    this.editingRule.set(false);
    this.previewResult.set(null);
    this.error.set("");
  }
  async cancelEditor() {
    if (this.editorChanged() && !(await this.ask("revenue.discard"))) return;
    this.editorChanged.set(false);
    this.editingAgreement.set(false);
    this.editingRule.set(false);
  }
  private ask(message: string) {
    return firstValueFrom(
      this.confirm.confirm({
        title: this.localization.translate("revenue.confirmTitle"),
        message: this.localization.translate(message),
        confirmText: this.localization.translate("common.confirm"),
        cancelText: this.localization.translate("common.cancel"),
      }),
    );
  }
  async confirmLeave() {
    return (
      !this.saving() && (!this.dirty() || (await this.ask("revenue.discard")))
    );
  }
  @HostListener("window:beforeunload", ["$event"]) beforeUnload(
    event: BeforeUnloadEvent,
  ) {
    if (this.dirty() || this.saving()) event.preventDefault();
  }
  async discard() {
    if (await this.ask("revenue.discard")) this.load();
  }
  async publish() {
    const loaded = this.loaded();
    if (this.saving() || !loaded) return;
    if (this.editorChanged()) {
      this.error.set("revenue.unstaged");
      return;
    }
    this.form.markAllAsTouched();
    this.publication.markAllAsTouched();
    if (this.form.invalid || this.publication.invalid) {
      this.tab.set("general");
      this.error.set("revenue.error.INVALID_INPUT");
      return;
    }
    if (!(await this.ask("revenue.publishConfirm"))) return;
    this.saving.set(true);
    this.error.set("");
    this.api
      .publish({
        expectedVersion: loaded.version,
        ...this.publication.getRawValue(),
        configuration: this.configuration(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.apply(saved);
          this.saving.set(false);
          this.toast.success(this.localization.translate("revenue.saved"));
          this.api
            .history()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (history) => this.history.set(history),
              error: () => this.error.set("revenue.error.REQUEST_FAILED"),
            });
        },
        error: (e) => {
          this.saving.set(false);
          this.error.set(this.errorKey(e));
        },
      });
  }
  preview() {
    if (this.previewing()) return;
    if (this.editorChanged()) {
      this.error.set("revenue.unstaged");
      return;
    }
    this.simulator.markAllAsTouched();
    if (this.simulator.invalid) {
      this.error.set("revenue.error.INVALID_INPUT");
      return;
    }
    const v = this.simulator.getRawValue();
    const scenario = {
      ...v,
      originatorId: v.originatorId || null,
      collectionDate: v.collectionDate || null,
      clientId: v.clientId || null,
      caseId: v.caseId || null,
      eventId: v.eventId || null,
      agreementId: v.agreementId || null,
      specialRuleId: v.specialRuleId || null,
    } as RevenuePreviewScenario;
    this.previewing.set(true);
    this.error.set("");
    this.previewResult.set(null);
    this.api
      .preview({ configuration: this.configuration(), scenario })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.previewResult.set(result);
          this.previewing.set(false);
        },
        error: (e) => {
          this.error.set(this.errorKey(e));
          this.previewing.set(false);
        },
      });
  }
  private errorKey(error: { status?: number; error?: { code?: string } }) {
    return error.status === 403
      ? "revenue.error.FORBIDDEN"
      : error.error?.code?.startsWith("revenue.")
        ? error.error.code.replace("revenue.", "revenue.error.")
        : "revenue.error.REQUEST_FAILED";
  }
  date(value: string | null) {
    return value
      ? new Intl.DateTimeFormat(this.locale(), {
          dateStyle: "medium",
          timeZone: "Europe/Belgrade",
        }).format(new Date(value))
      : this.localization.translate("revenue.openEnded");
  }
  locale() {
    return this.localization.language() === "EN" ? "en-GB" : "sr-Latn-RS";
  }
  percent(value: string | null) {
    return value === null
      ? this.localization.translate("revenue.enum.UNCONFIGURED")
      : new Intl.NumberFormat(this.locale(), {
          style: "percent",
          maximumFractionDigits: 2,
        }).format(Number(value) / 100);
  }
  money(value: string | null) {
    return value === null
      ? this.localization.translate("revenue.unavailable")
      : new Intl.NumberFormat(this.locale(), {
          style: "currency",
          currency: "RSD",
        }).format(Number(value));
  }
  historyChanges(
    entry: RevenueHistoryEntry,
  ): { label: string; oldValue: string; newValue: string }[] {
    const previous =
      this.history().find((v) => v.version === entry.version - 1)
        ?.configuration ?? defaultRevenueConfiguration();
    const changes: { label: string; oldValue: string; newValue: string }[] = [];
    const flatten = (value: unknown, prefix = ""): Record<string, unknown> => {
      if (value && typeof value === "object")
        return Object.entries(value).reduce(
          (acc, [key, val]) => ({
            ...acc,
            ...flatten(val, prefix ? `${prefix}.${key}` : key),
          }),
          {},
        );
      return { [prefix]: value };
    };
    const old = flatten(previous),
      next = flatten(entry.configuration);
    for (const path of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (path.endsWith(".id") || old[path] === next[path]) continue;
      const parts = path.split(".");
      const last = parts[parts.length - 1];
      let label = this.localization.translate(
        "revenue." +
          (parts[0] === "agreements"
            ? "agreement"
            : parts[0] === "specialRules"
              ? "specialRule"
              : parts[0]),
      );
      if (parts[0] === "agreements" || parts[0] === "specialRules") {
        const index = Number(parts[1]);
        const rows =
          parts[0] === "agreements"
            ? entry.configuration.agreements
            : entry.configuration.specialRules;
        const before =
          parts[0] === "agreements"
            ? previous.agreements
            : previous.specialRules;
        label += ` · ${this.memberName((rows[index] ?? before[index])?.memberId)}`;
      }
      label +=
        parts.length > 1
          ? ` · ${parts
              .filter((p) => !/^\d+$/.test(p))
              .slice(1)
              .map((p) =>
                REVENUE_ORIGINS.includes(p as (typeof REVENUE_ORIGINS)[number])
                  ? this.localization.translate("revenue.enum." + p)
                  : this.localization.translate("revenue." + p),
              )
              .join(" · ")}`
          : "";
      const display = (v: unknown) => {
        if (v === null || v === undefined || v === "")
          return this.localization.translate("revenue.none");
        if (typeof v === "boolean")
          return this.localization.translate(
            "revenue.enum." + (v ? "YES" : "NO"),
          );
        if (last === "memberId") return this.memberName(String(v));
        if (last === "scopeId") {
          const i = Number(parts[1]);
          const r =
            entry.configuration.specialRules[i] ?? previous.specialRules[i];
          return r
            ? this.scopeName({ ...r, scopeId: String(v) })
            : this.localization.translate("revenue.unavailable");
        }
        if (last === "percentage") return this.percent(String(v));
        if (/Date$|^effective/.test(last)) return this.date(String(v));
        if (["description", "poolId"].includes(last)) return String(v);
        return this.localization.translate("revenue.enum." + v);
      };
      changes.push({
        label,
        oldValue: display(old[path]),
        newValue: display(next[path]),
      });
    }
    return changes;
  }
}
