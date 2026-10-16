import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
  output,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
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
  RevenueConfiguration,
  RevenueAgreement,
  RevenueOrigin,
  RevenueSpecialRule,
  RevenueReferences,
  RevenueSettingsResponse,
  RevenueHistoryEntry,
  RevenuePreviewResult,
  RevenuePreviewScenario,
  RevenueRates,
  RevenueAgreementType,
  RevenueBasis,
  RevenueCategory,
  RevenueCombination,
  RevenueDeparturePolicy,
  RevenueEntitlementDatePolicy,
  RevenueExpenseTreatment,
  RevenueMemberStatus,
  RevenueMissingRulePolicy,
  RevenueMode,
  RevenuePartialPaymentPolicy,
  RevenueRateState,
  RevenueScope,
  RevenueVatBasis,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTabsImports } from "@spartan-ng/helm/tabs";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronLeft, lucideChevronRight } from "@ng-icons/lucide";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { RevenueSelectComponent } from "./revenue-select.component";
import {
  makeRateForm,
  readRate,
  writeRate,
  RevenueRateComponent,
  RevenueRateForm,
} from "./revenue-rate.component";
import { officeToday } from "../time/time-utils";
import {
  RevenuePublishDialogComponent,
  RevenuePublishDialogContext,
  RevenuePublishDialogResult,
} from "./revenue-publish-dialog.component";
import {
  RevenueRuleDialogComponent,
  RevenueRuleDialogContext,
} from "./revenue-rule-dialog.component";
import {
  RevenueAgreementDialogComponent,
  RevenueAgreementDialogContext,
} from "./revenue-agreement-dialog.component";
import { RevenueRoleModelSheetComponent } from "./revenue-role-model-sheet.component";
import {
  OFFICE_TIME_ZONE,
  REVENUE_AGREEMENT_TYPE_LABELS,
  REVENUE_BASIS_LABELS,
  REVENUE_CATEGORY_LABELS,
  REVENUE_COMBINATION_LABELS,
  REVENUE_DEPARTURE_POLICY_LABELS,
  REVENUE_ENTITLEMENT_DATE_POLICY_LABELS,
  REVENUE_ENUM_LABELS,
  REVENUE_EXPENSE_TREATMENT_LABELS,
  REVENUE_MEMBER_FILTER_LABELS,
  REVENUE_MISSING_RULE_POLICY_LABELS,
  REVENUE_MODE_LABELS,
  REVENUE_ORIGIN_LABELS,
  REVENUE_PARTIAL_PAYMENT_POLICY_LABELS,
  REVENUE_SCOPE_LABELS,
  REVENUE_SELF_ORIGINATION_LABELS,
  REVENUE_TAB_LABELS,
  REVENUE_VAT_BASIS_LABELS,
  REVENUE_VERSION_STATUS_LABELS,
  SelectOption,
  filterOptionsFrom,
  labelOf,
  optionsFrom,
} from "../../shared/models";
import {
  RevenueMemberFilter,
  RevenueRuleActivity,
  RevenueSelfOrigination,
  RevenueTab,
  RevenueVersionStatus,
} from "../../shared/models";

const MEDIUM_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeZone: OFFICE_TIME_ZONE,
};
const REVENUE_CURRENCY = "RSD";
const INDIVIDUAL_AGREEMENT_TYPES: readonly RevenueAgreementType[] = [
  RevenueAgreementType.INDIVIDUAL,
  RevenueAgreementType.EXCLUDED,
  RevenueAgreementType.UNCONFIGURED,
];
const VISIBLE_RATE_STATES: readonly RevenueRateState[] = [
  RevenueRateState.PERCENTAGE,
  RevenueRateState.EXCLUDED,
];

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
    ) as Record<RevenueOrigin, RevenueRateForm>,
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
    NgTemplateOutlet,
    NgIcon,
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmSwitch,
    HlmSpinner,
    HlmTabsImports,
    HlmTableImports,
    RevenueRoleModelSheetComponent,
    TranslatePipe,
    RevenueSelectComponent,
    RevenueRateComponent,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  templateUrl: "./revenue-sharing.component.html",
})
export class RevenueSharingComponent {
  readonly published = output<void>();
  private readonly api = inject(RevenueSharingApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly dialogs = inject(HlmDialogService);
  private ruleDialogRef: BrnDialogRef<boolean | undefined> | null = null;
  private agreementDialogRef: BrnDialogRef<boolean | undefined> | null = null;
  readonly selectedRoleModel = signal<string | null>(null);
  readonly simulatorWide = signal(false);
  readonly simulatorExpanded = signal(false);
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
  readonly tab = signal<string>(RevenueTab.OVERVIEW);
  readonly RevenueTab = RevenueTab;
  readonly tabOptions = optionsFrom(REVENUE_TAB_LABELS);
  readonly versionStatusLabels = REVENUE_VERSION_STATUS_LABELS;
  readonly RevenueVersionStatus = RevenueVersionStatus;
  readonly RevenueRuleActivity = RevenueRuleActivity;
  readonly origins = REVENUE_ORIGINS;
  readonly originLabels = REVENUE_ORIGIN_LABELS;
  readonly filter = textControl(RevenueMemberFilter.ACTIVE);
  readonly filterOptions = optionsFrom(REVENUE_MEMBER_FILTER_LABELS);
  readonly filteredMembers = signal<RevenueReferences["members"]>([]);
  // TODO(revenue-sharing): Requires versioned role-default fields in the API. Purpose: define standard compensation by actual team role. Needed: persisted role-keyed fixed/percentage model fields.
  // TODO(revenue-sharing): Requires monthly compensation fields in RevenueConfiguration and RevenueAgreement. Purpose: support fixed or combined monthly pay. Needed: versioned amounts and calculation semantics; UserRate is hourly and must not be repurposed.
  // TODO(revenue-sharing): Requires a server-side draft resource and save endpoint. Purpose: resume unpublished edits across sessions. Needed: persisted draft lifecycle separate from immutable publication.
  readonly memberRoles = computed(() =>
    [
      ...new Set(
        this.references()
          .members.filter(
            (member) => member.status === RevenueMemberStatus.ACTIVE,
          )
          .map((member) => member.role),
      ),
    ].sort(),
  );
  readonly modes = optionsFrom(REVENUE_MODE_LABELS);
  readonly bases = optionsFrom(REVENUE_BASIS_LABELS);
  readonly agreementTypes = optionsFrom(REVENUE_AGREEMENT_TYPE_LABELS);
  readonly departurePolicies = optionsFrom(REVENUE_DEPARTURE_POLICY_LABELS);
  readonly scopeTypes = optionsFrom(REVENUE_SCOPE_LABELS);
  readonly categories = optionsFrom(REVENUE_CATEGORY_LABELS);
  readonly combinations = optionsFrom(REVENUE_COMBINATION_LABELS);
  readonly originOptions = optionsFrom(REVENUE_ORIGIN_LABELS);
  readonly originOrAny = filterOptionsFrom(
    REVENUE_ORIGIN_LABELS,
    "revenue.anyOrigin",
  );
  readonly selfOptions = optionsFrom(REVENUE_SELF_ORIGINATION_LABELS);
  readonly generalFields = [
    { key: "primaryRevenueBasis" as const, options: this.bases },
    {
      key: "vatBasis" as const,
      options: optionsFrom(REVENUE_VAT_BASIS_LABELS),
    },
    {
      key: "expenseTreatment" as const,
      options: optionsFrom(REVENUE_EXPENSE_TREATMENT_LABELS),
    },
    {
      key: "partialPaymentPolicy" as const,
      options: optionsFrom(REVENUE_PARTIAL_PAYMENT_POLICY_LABELS),
    },
    {
      key: "entitlementDatePolicy" as const,
      options: optionsFrom(REVENUE_ENTITLEMENT_DATE_POLICY_LABELS),
    },
    {
      key: "missingRulePolicy" as const,
      options: optionsFrom(REVENUE_MISSING_RULE_POLICY_LABELS),
    },
  ];
  readonly form = new FormGroup({
    enabled: booleanControl(),
    configurationMode: textControl(RevenueMode.SHARED_RULES),
    primaryRevenueBasis: textControl(RevenueBasis.COLLECTED),
    vatBasis: textControl(RevenueVatBasis.EXCLUDING_VAT),
    expenseTreatment: textControl(RevenueExpenseTreatment.EXCLUDE),
    partialPaymentPolicy: textControl(RevenuePartialPaymentPolicy.PROPORTIONAL),
    entitlementDatePolicy: textControl(
      RevenueEntitlementDatePolicy.WORK_EXECUTION_DATE,
    ),
    missingRulePolicy: textControl(
      RevenueMissingRulePolicy.REQUIRES_CONFIGURATION,
    ),
    rates: ratesForm(),
    originationEnabled: booleanControl(),
    originationRate: makeRateForm(),
    originationOnOthersWork: booleanControl(true),
    selfOrigination: booleanControl(),
    allowPersonalOriginationOverride: booleanControl(),
  });
  readonly publication = new FormGroup({
    effectiveFrom: textControl(officeToday(), true),
    reason: textControl("", true),
  });
  readonly agreementEditor = new FormGroup({
    id: textControl(),
    memberId: textControl("", true),
    agreementType: textControl(RevenueAgreementType.INHERIT),
    effectiveFrom: textControl(officeToday(), true),
    effectiveTo: textControl(),
    rates: ratesForm(true),
    originationRate: makeRateForm(true),
    selfOrigination: textControl(RevenueSelfOrigination.INHERIT),
    departurePolicy: textControl(
      RevenueDeparturePolicy.RETAIN_EARNINGS_ON_PRIOR_WORK,
    ),
    departureCutoffDate: textControl(),
    description: textControl(),
  });
  readonly ruleEditor = new FormGroup({
    id: textControl(),
    memberId: textControl("", true),
    scopeType: textControl(RevenueScope.FIRM),
    scopeId: textControl(),
    earningType: textControl(RevenueCategory.WORK_SHARE),
    clientOrigin: textControl(RevenueOrigin.OWN_CLIENT),
    percentage: textControl("", true),
    revenueBasis: textControl(RevenueBasis.COLLECTED),
    combinationMode: textControl(RevenueCombination.OVERRIDE),
    poolId: textControl(),
    effectiveFrom: textControl(officeToday(), true),
    effectiveTo: textControl(),
    active: booleanControl(true),
    description: textControl(),
  });
  readonly simulator = new FormGroup({
    amount: textControl("", true),
    revenueBasis: textControl(RevenueBasis.COLLECTED),
    memberId: textControl("", true),
    clientOrigin: textControl(RevenueOrigin.OWN_CLIENT),
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
    this.syncSimulatorViewport();
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
  @HostListener("window:resize")
  syncSimulatorViewport() {
    if (typeof window === "undefined") return;
    const wide = window.matchMedia("(min-width: 1700px)").matches;
    if (wide === this.simulatorWide()) return;
    this.simulatorWide.set(wide);
    this.simulatorExpanded.set(wide);
  }
  toggleSimulator() {
    this.simulatorExpanded.update((expanded) => !expanded);
  }
  updateMode() {
    const mode = this.form.controls.configurationMode.value;
    this.individualMode.set(mode !== RevenueMode.SHARED_RULES);
    this.advancedMode.set(mode === RevenueMode.ADVANCED);
  }
  openRoleModel(role: string) {
    this.tab.set(RevenueTab.MODELS);
    this.selectedRoleModel.set(role);
  }
  closeRoleModel() {
    this.selectedRoleModel.set(null);
  }
  updateMembers() {
    const filter = this.filter.value;
    this.filteredMembers.set(
      this.references().members.filter(
        (m) =>
          filter === RevenueMemberFilter.ALL ||
          (filter === RevenueMemberFilter.ACTIVE
            ? m.status === RevenueMemberStatus.ACTIVE
            : m.status === RevenueMemberStatus.FORMER),
      ),
    );
  }
  openPublicationDialog() {
    const loaded = this.loaded();
    if (!loaded || this.saving() || !this.dirty() || this.editorChanged()) {
      if (this.editorChanged()) this.error.set("revenue.unstaged");
      return;
    }
    const minimumDate =
      loaded.effectiveFrom && loaded.effectiveFrom > officeToday()
        ? loaded.effectiveFrom
        : officeToday();
    const context: RevenuePublishDialogContext = {
      version: loaded.version + 1,
      effectiveFrom: this.publication.controls.effectiveFrom.value,
      minimumDate,
      reason: this.publication.controls.reason.value,
      summary: this.publicationSummary(),
    };
    this.dialogs
      .open<RevenuePublishDialogResult, RevenuePublishDialogContext>(
        RevenuePublishDialogComponent,
        {
          context,
          contentClass:
            "w-[calc(100vw-2rem)] sm:max-w-xl h-[90dvh] max-h-[90dvh] min-h-0 overflow-hidden flex flex-col",
        },
      )
      .closed$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) void this.publish(result);
      });
  }
  publicationSummary(): {
    label: string;
    oldValue: string;
    newValue: string;
  }[] {
    const loaded = this.loaded();
    if (!loaded) return [];
    return this.historyChanges({
      id: "pending-publication",
      version: loaded.version + 1,
      effectiveFrom: this.publication.controls.effectiveFrom.value,
      createdAt: "",
      reason: "",
      changedBy: "",
      configuration: this.configuration(),
    });
  }
  effectiveVersion(): RevenueHistoryEntry | null {
    const today = officeToday();
    return (
      this.history()
        .filter(
          (entry): entry is RevenueHistoryEntry & { effectiveFrom: string } =>
            entry.effectiveFrom !== null && entry.effectiveFrom <= today,
        )
        .sort(
          (a, b) =>
            b.effectiveFrom.localeCompare(a.effectiveFrom) ||
            b.version - a.version,
        )[0] ?? null
    );
  }
  versionStatus(entry: RevenueHistoryEntry): RevenueVersionStatus {
    if (!entry.effectiveFrom) return RevenueVersionStatus.UNKNOWN;
    if (entry.effectiveFrom > officeToday())
      return RevenueVersionStatus.SCHEDULED;
    return this.effectiveVersion()?.id === entry.id
      ? RevenueVersionStatus.CURRENT
      : RevenueVersionStatus.HISTORICAL;
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
  /** Translated label of any revenue enum value, role or preview explanation. */
  enumLabel(value: string | null | undefined): string {
    return labelOf(REVENUE_ENUM_LABELS, value, (key) =>
      this.localization.translate(key),
    );
  }
  memberName(id: string) {
    return (
      this.references().members.find((m) => m.id === id)?.name ??
      this.localization.translate("revenue.unavailable")
    );
  }
  rateSummary(origin: RevenueOrigin) {
    const rate = readRate(this.form.controls.rates.controls[origin]);
    return rate.state === RevenueRateState.PERCENTAGE
      ? this.percent(rate.percentage)
      : this.enumLabel(rate.state);
  }
  originationSummary() {
    return this.form.controls.originationEnabled.value
      ? this.rateSummaryForOrigination()
      : this.localization.translate("revenue.originationDisabled");
  }
  private rateSummaryForOrigination() {
    const rate = readRate(this.form.controls.originationRate);
    return rate.state === RevenueRateState.PERCENTAGE
      ? this.percent(rate.percentage)
      : this.enumLabel(rate.state);
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
    switch (this.ruleEditor.controls.scopeType.value) {
      case RevenueScope.MEMBER:
        return this.memberOptions();
      case RevenueScope.CLIENT:
        return this.referenceOptions("clients");
      case RevenueScope.CASE:
        return this.referenceOptions("cases");
      case RevenueScope.WORK_EVENT:
        return this.referenceOptions("events");
      default:
        return [];
    }
  }
  scopeName(rule: RevenueSpecialRule) {
    if (rule.scopeType === RevenueScope.FIRM)
      return this.enumLabel(RevenueScope.FIRM);
    if (rule.scopeType === RevenueScope.MEMBER)
      return this.memberName(rule.scopeId ?? "");
    const list =
      rule.scopeType === RevenueScope.CLIENT
        ? "clients"
        : rule.scopeType === RevenueScope.CASE
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
          label: `${this.memberName(r.memberId)} · ${this.scopeName(r)} · ${this.enumLabel(r.earningType)}`,
        })),
    ];
  }
  agreementsFor(id: string) {
    return this.agreements().filter((a) => a.memberId === id);
  }
  individualAgreements() {
    return this.agreements().filter((agreement) =>
      INDIVIDUAL_AGREEMENT_TYPES.includes(agreement.agreementType),
    );
  }
  individualAgreementMemberCount() {
    return new Set(
      this.individualAgreements().map((agreement) => agreement.memberId),
    ).size;
  }
  agreementSummary(agreement: RevenueAgreement) {
    const rates = REVENUE_ORIGINS.filter((origin) =>
      VISIBLE_RATE_STATES.includes(agreement.rates[origin].state),
    ).map(
      (origin) =>
        `${this.enumLabel(origin)} ${this.rateValue(agreement.rates[origin])}`,
    );
    if (VISIBLE_RATE_STATES.includes(agreement.originationRate.state)) {
      rates.push(
        `${this.localization.translate("revenue.originationRate")} ${this.rateValue(agreement.originationRate)}`,
      );
    }
    return rates.length
      ? rates.join(" · ")
      : this.localization.translate("revenue.noRateOverrides");
  }
  private rateValue(rate: RevenueAgreement["originationRate"]) {
    return rate.state === RevenueRateState.PERCENTAGE
      ? this.percent(rate.percentage)
      : this.enumLabel(RevenueRateState.EXCLUDED);
  }
  private previewShareWidth(value: string | null) {
    const amount = Number(this.simulator.controls.amount.value);
    const share = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(share))
      return 0;
    return Math.max(0, Math.min(100, (share / amount) * 100));
  }
  previewWorkWidth(result: RevenuePreviewResult) {
    return this.previewShareWidth(result.workAmount);
  }
  previewOriginationWidth(result: RevenuePreviewResult) {
    return this.previewShareWidth(result.originationAmount);
  }
  previewResidualWidth(result: RevenuePreviewResult) {
    return this.previewShareWidth(result.residual);
  }
  memberAgreementLabel(memberId: string) {
    const today = officeToday();
    const agreement = this.agreementsFor(memberId)
      .filter(
        (row) =>
          row.effectiveFrom <= today &&
          (!row.effectiveTo || row.effectiveTo >= today),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    if (!agreement) return this.localization.translate("revenue.sharedModel");
    return this.enumLabel(agreement.agreementType);
  }
  async editAgreement(memberId: string, agreement?: RevenueAgreement) {
    if (this.editorChanged() && !(await this.ask("revenue.discard"))) return;
    this.agreementEditor.enable({ emitEvent: false });
    const a =
      agreement ??
      ({
        id: crypto.randomUUID(),
        memberId,
        agreementType: RevenueAgreementType.UNCONFIGURED,
        effectiveFrom: this.publication.controls.effectiveFrom.value,
        effectiveTo: null,
        rates: revenueEmptyRates(true),
        originationRate: { state: RevenueRateState.INHERIT, percentage: null },
        selfOrigination: null,
        departurePolicy: RevenueDeparturePolicy.RETAIN_EARNINGS_ON_PRIOR_WORK,
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
          selfOrigination === null
            ? RevenueSelfOrigination.INHERIT
            : selfOrigination
              ? RevenueSelfOrigination.YES
              : RevenueSelfOrigination.NO,
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
    this.openAgreementDialog();
  }
  memberRoleName(memberId: string) {
    const role = this.references().members.find(
      (member) => member.id === memberId,
    )?.role;
    return role
      ? this.enumLabel(role)
      : this.localization.translate("revenue.unavailable");
  }
  private openAgreementDialog() {
    if (this.agreementDialogRef) return;
    this.agreementDialogRef = this.dialogs.open<
      boolean | undefined,
      RevenueAgreementDialogContext
    >(RevenueAgreementDialogComponent, {
      context: { editor: this },
      contentClass:
        "w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col",
      showCloseButton: false,
      disableClose: true,
      closeOnOutsidePointerEvents: false,
    });
    this.agreementDialogRef.closed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => (this.agreementDialogRef = null));
  }
  stageAgreement(): boolean {
    this.agreementEditor.markAllAsTouched();
    if (this.agreementEditor.invalid) {
      this.error.set("revenue.error.INVALID_INPUT");
      return false;
    }
    const v = this.agreementEditor.getRawValue();
    const a = {
      ...v,
      rates: readRates(this.agreementEditor.controls.rates),
      originationRate: readRate(this.agreementEditor.controls.originationRate),
      selfOrigination:
        v.selfOrigination === RevenueSelfOrigination.INHERIT
          ? null
          : v.selfOrigination === RevenueSelfOrigination.YES,
      effectiveTo: v.effectiveTo || null,
      departureCutoffDate: v.departureCutoffDate || null,
    } as RevenueAgreement;
    this.agreements.update((rows) =>
      rows.some((row) => row.id === a.id)
        ? rows.map((row) => (row.id === a.id ? a : row))
        : [...rows, a],
    );
    this.stageDone();
    return true;
  }
  async editRule(rule?: RevenueSpecialRule) {
    if (this.editorChanged() && !(await this.ask("revenue.discard"))) return;
    this.ruleEditor.enable({ emitEvent: false });
    const r = rule ?? {
      id: crypto.randomUUID(),
      memberId: "",
      scopeType: RevenueScope.FIRM,
      scopeId: null,
      earningType: RevenueCategory.WORK_SHARE,
      clientOrigin: RevenueOrigin.OWN_CLIENT,
      percentage: "",
      revenueBasis: this.form.controls.primaryRevenueBasis.value,
      combinationMode: RevenueCombination.OVERRIDE,
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
    this.openRuleDialog();
  }
  private openRuleDialog() {
    if (this.ruleDialogRef) return;
    this.ruleDialogRef = this.dialogs.open<
      boolean | undefined,
      RevenueRuleDialogContext
    >(RevenueRuleDialogComponent, {
      context: { editor: this },
      contentClass: "sm:max-w-2xl max-h-[90dvh] overflow-y-auto",
      showCloseButton: false,
      disableClose: true,
      closeOnOutsidePointerEvents: false,
    });
    this.ruleDialogRef.closed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => (this.ruleDialogRef = null));
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
        v.scopeType === RevenueScope.FIRM
          ? null
          : v.scopeType === RevenueScope.MEMBER
            ? v.memberId
            : v.scopeId || null,
      poolId:
        v.combinationMode === RevenueCombination.EXCLUSIVE_SPLIT
          ? v.poolId || null
          : null,
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
  async cancelEditor(): Promise<boolean> {
    if (this.editorChanged() && !(await this.ask("revenue.discard")))
      return false;
    this.editorChanged.set(false);
    this.editingAgreement.set(false);
    this.editingRule.set(false);
    return true;
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
    if (this.saving() || (this.dirty() && !(await this.ask("revenue.discard"))))
      return false;
    this.ruleDialogRef?.close(undefined);
    this.ruleDialogRef = null;
    this.agreementDialogRef?.close(undefined);
    this.agreementDialogRef = null;
    return true;
  }
  @HostListener("window:beforeunload", ["$event"]) beforeUnload(
    event: BeforeUnloadEvent,
  ) {
    if (this.dirty() || this.saving()) event.preventDefault();
  }
  async discard() {
    if (await this.ask("revenue.discard")) this.load();
  }
  async publish(publication: RevenuePublishDialogResult) {
    const loaded = this.loaded();
    if (this.saving() || !loaded) return;
    if (this.editorChanged()) {
      this.error.set("revenue.unstaged");
      return;
    }
    this.form.markAllAsTouched();
    this.publication.patchValue(publication, { emitEvent: false });
    this.publication.markAllAsTouched();
    if (this.form.invalid || this.publication.invalid) {
      this.tab.set(RevenueTab.MODELS);
      this.error.set("revenue.error.INVALID_INPUT");
      return;
    }
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
          this.api
            .history()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (history) => this.history.set(history) });
          this.toast.success(this.localization.translate("revenue.saved"));
          this.published.emit();
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
      ? new Intl.DateTimeFormat(
          this.localization.locale(),
          MEDIUM_DATE_FORMAT,
        ).format(new Date(value))
      : this.localization.translate("revenue.openEnded");
  }
  percent(value: string | null) {
    return value === null
      ? this.enumLabel(RevenueRateState.UNCONFIGURED)
      : new Intl.NumberFormat(this.localization.locale(), {
          style: "percent",
          maximumFractionDigits: 2,
        }).format(Number(value) / 100);
  }
  money(value: string | null) {
    return value === null
      ? this.localization.translate("revenue.unavailable")
      : new Intl.NumberFormat(this.localization.locale(), {
          style: "currency",
          currency: REVENUE_CURRENCY,
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
                REVENUE_ORIGINS.includes(p as RevenueOrigin)
                  ? this.enumLabel(p)
                  : this.localization.translate("revenue." + p),
              )
              .join(" · ")}`
          : "";
      const display = (v: unknown) => {
        if (v === null || v === undefined || v === "")
          return this.localization.translate("revenue.none");
        if (typeof v === "boolean")
          return this.enumLabel(
            v ? RevenueSelfOrigination.YES : RevenueSelfOrigination.NO,
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
        return this.enumLabel(String(v));
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
