import { DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import {
  ReferencesApiClient,
  BillingSetupApiClient,
  CasesApiClient,
  EventsApiClient,
  ClientsApiClient,
  WorkEntriesApiClient,
  WorkManagementApiClient,
  OrganizationSettingsApiClient,
} from "@law/api-clients";
import {
  CaseReference,
  TaskDetail,
  EventDetail,
  ClientReference,
  ServiceCategory,
  WorkCaptureParseResponse,
  WorkEntry,
  WorkEntryTreatment,
  WorkEntryActions,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideMic, lucideMicOff } from "@ng-icons/lucide";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
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
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmRadioGroupImports } from "@spartan-ng/helm/radio-group";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  filter,
  forkJoin,
  from,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
  throwError,
} from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { SpeechRecognitionService } from "../../../core/speech/speech-recognition.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { createSelectItemToString, SelectOption } from "../../../shared/utils";
import {
  CURRENCY_OPTIONS,
  createCurrencyItemToString,
} from "../../../shared/currency";
import {
  activeAgreementOn,
  AgreementTerms,
  agreementTerms,
  defaultTreatment,
} from "../treatment";
import {
  STATUS_LABEL_KEYS,
  TREATMENT_LABEL_KEYS,
  formatMinutes,
} from "../time-utils";
import { integerValidator } from "../validators";
import { QuickCaptureInput } from "./quick-capture.models";

const OFFICE_TIME_ZONE = "Europe/Belgrade";
const RECENT_ENTRY_COUNT = 20;
const LIST_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 250;
const TITLE_MAX_LENGTH = 200;
const WORK_VALUE_PATTERN = /^\d{1,16}(?:[.,]\d{1,2})?$/;

function workValueValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? "").trim();
  if (!value) return null;
  const [whole] = value.replace(",", ".").split(".");
  return WORK_VALUE_PATTERN.test(value) && whole.replace(/^0+/, "").length <= 16
    ? null
    : { workValue: true };
}

function workValueCurrencyValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const form = control as FormGroup;
  return form.get("value")?.value && !form.get("currency")?.value
    ? { workValueCurrency: true }
    : null;
}

function normalizeWorkValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [whole, fraction = ""] = trimmed.replace(",", ".").split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

interface ClientOption {
  id: string;
  name: string;
}

interface CaseOption {
  id: string;
  caseNumber: string;
  name: string;
  client: ClientReference;
}

const TITLE_KEYS: Record<QuickCaptureInput["mode"], string> = {
  create: "time.capture.title.create",
  "confirm-timer": "time.capture.title.confirmTimer",
  "confirm-source": "time.capture.title.confirmSource",
  edit: "time.capture.title.edit",
  view: "work.entries.viewTitle",
};

/** Today as a YYYY-MM-DD calendar day in the office time zone. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIME_ZONE,
  }).format(new Date());
}

@Component({
  selector: "law-quick-capture-dialog",
  standalone: true,
  templateUrl: "./quick-capture-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    DatePipe,
    NgIcon,
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
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmRadioGroupImports,
    HlmTooltip,
    HlmTextarea,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideMic, lucideMicOff })],
})
export class QuickCaptureDialogComponent {
  private readonly injector = inject(Injector);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly tasksApi = inject(WorkManagementApiClient);
  private readonly entriesApi = inject(WorkEntriesApiClient);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly billingApi = inject(BillingSetupApiClient);
  private readonly organizationSettingsApi = inject(
    OrganizationSettingsApiClient,
  );
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly auth = inject(AuthState);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context =
    injectBrnDialogContext<QuickCaptureInput<unknown>>();
  protected readonly speech = inject(SpeechRecognitionService);
  readonly dialogRef = inject(BrnDialogRef<unknown>);

  readonly linkedEventId = signal(
    this.context.eventId ??
      (this.context.source?.sourceType === "EVENT"
        ? this.context.source.sourceId
        : undefined),
  );
  readonly linkedEvent = signal<EventDetail | null>(null);
  readonly openingEvent = signal(false);
  openLinkedEvent(): void {
    const id = this.linkedEventId();
    if (!id || this.openingEvent() || this.saving()) return;
    this.openingEvent.set(true);
    this.eventsApi
      .get(id)
      .pipe(
        tap((event) => this.linkedEvent.set(event)),
        switchMap((event) =>
          from(import("../../calendar/event-dialog/event-dialog.service")).pipe(
            switchMap(({ EventDialogService }) =>
              this.injector.get(EventDialogService).open({ event }),
            ),
          ),
        ),
        finalize(() => this.openingEvent.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (event) => {
          if (event) this.linkedEvent.set(event);
        },
        error: () =>
          this.toast.error(
            this.localization.translate("time.events.actionError"),
          ),
      });
  }

  readonly linkedTaskId = signal(this.context.taskId);
  readonly linkedTask = signal<TaskDetail | null>(null);
  readonly openingTask = signal(false);

  openLinkedTask(): void {
    const id = this.linkedTaskId();
    if (!id || this.openingTask() || this.saving()) return;
    this.openingTask.set(true);
    this.tasksApi
      .getTask(id)
      .pipe(
        tap((task) => this.linkedTask.set(task)),
        // Lazy loading avoids the task-dialog -> quick-capture -> task-dialog cycle.
        switchMap((task) =>
          from(
            import("../../work-management/task-dialog/task-dialog.service"),
          ).pipe(
            switchMap(({ TaskDialogService }) =>
              this.injector.get(TaskDialogService).open({ task }),
            ),
          ),
        ),
        finalize(() => this.openingTask.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (task) => {
          if (task) this.linkedTask.set(task);
        },
        error: () =>
          this.toast.error(
            this.localization.translate("time.capture.taskLoadError"),
          ),
      });
  }

  readonly managingEntry = Boolean(
    this.context.manageEntry && this.context.entryId,
  );
  readonly entryActions = signal<WorkEntryActions | null>(null);
  readonly entryLoadFailed = signal(false);
  readonly restoredStatus = new FormControl<"WRITTEN_OFF" | "CONFIRMED">(
    "WRITTEN_OFF",
    { nonNullable: true },
  );
  readonly restoreStatusOptions = [
    { value: "WRITTEN_OFF", label: "time.status.writtenOff" },
    { value: "CONFIRMED", label: "time.status.confirmed" },
  ];
  readonly restoreStatusItemToString = createSelectItemToString(
    this.restoreStatusOptions,
    (key) => this.localization.translate(key),
  );
  readonly loadedEntry = signal<WorkEntry | null>(null);
  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly treatmentLabelKeys = TREATMENT_LABEL_KEYS;
  readonly formatMinutes = formatMinutes;
  readonly readOnly = computed(
    () =>
      this.context.mode === "view" ||
      ["BILLED", "RUNNING"].includes(this.loadedEntry()?.status ?? "") ||
      (this.managingEntry && !this.entryActions()?.canEdit),
  );
  readonly deletionInfoKey = computed(() => {
    switch (this.entryActions()?.deleteBlockedReason) {
      case "LAST_TASK_ENTRY":
        return "work.entries.lastEntryInfo";
      case "BILLED":
        return "work.entries.billedInfo";
      case "NOT_ALLOWED":
        return "work.entries.deleteNotAllowed";
      default:
        return null;
    }
  });
  readonly mode = this.context.mode;
  readonly canFinishWithoutNewWork = Boolean(this.context.finishWithoutNewWork);
  /** Source confirmations take client, case and treatment from the source. */
  readonly fromSource = this.mode === "confirm-source";
  readonly eventLinked = signal(
    Boolean(
      this.context.eventId || this.context.source?.sourceType === "EVENT",
    ),
  );
  readonly minuteChips = [15, 30, 60, 120] as const;
  readonly treatmentOptions: SelectOption<WorkEntryTreatment>[] = [
    { value: "RETAINER", label: "time.treatment.retainer" },
    { value: "AT", label: "time.treatment.at" },
    { value: "HOURLY", label: "time.treatment.hourly" },
    { value: "NON_BILLABLE", label: "time.treatment.nonBillable" },
    { value: "UNDECIDED", label: "time.treatment.undecided" },
  ];
  readonly currencyOptions: SelectOption[] = [
    { value: "", label: "time.capture.noCurrency" },
    ...CURRENCY_OPTIONS,
  ];
  readonly currencyItemToString = (value: string | null | undefined): string =>
    value
      ? createCurrencyItemToString((key) => this.localization.translate(key))(
          value,
        )
      : this.localization.translate("time.capture.noCurrency");
  readonly form = new FormGroup(
    {
      userId: new FormControl(
        this.context.userId === undefined
          ? (this.auth.session()?.user.id ?? "")
          : (this.context.userId ?? ""),
        { nonNullable: true },
      ),
      clientId: new FormControl(this.context.clientId ?? "", {
        nonNullable: true,
        validators: this.eventLinked() ? [] : [Validators.required],
      }),
      caseId: new FormControl(this.context.caseId ?? "", { nonNullable: true }),
      // Time is optional: untimed work is priced later on the invoice. Only a
      // stopped timer must keep its minutes.
      minutes: new FormControl<number | null>(this.context.minutes ?? null, {
        validators: [
          ...(this.context.requireMinutes ? [Validators.required] : []),
          integerValidator,
          Validators.min(1),
          Validators.max(1440),
        ],
      }),
      workDate: new FormControl(this.context.workDate ?? today(), {
        nonNullable: true,
        validators: [Validators.required],
      }),
      /** One-sentence summary; also the text the AI fill reads. */
      title: new FormControl(this.context.title ?? "", {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.pattern(/\S/),
          Validators.maxLength(TITLE_MAX_LENGTH),
        ],
      }),
      description: new FormControl(this.context.description ?? "", {
        nonNullable: true,
      }),
      value: new FormControl(this.context.value ?? "", {
        nonNullable: true,
        validators: workValueValidator,
      }),
      currency: new FormControl(
        this.context.currency === undefined
          ? "RSD"
          : (this.context.currency ?? ""),
        {
          nonNullable: true,
        },
      ),
      serviceCategoryId: new FormControl("", { nonNullable: true }),
      treatment: new FormControl<WorkEntryTreatment>(
        this.context.treatment ??
          (this.eventLinked() && !this.context.clientId
            ? "NON_BILLABLE"
            : "UNDECIDED"),
        {
          nonNullable: true,
        },
      ),
    },
    { validators: workValueCurrencyValidator },
  );
  readonly saving = signal(false);
  readonly loadingEntry = signal(false);
  readonly parsing = signal(false);
  readonly parseFailed = signal(false);
  readonly aiParsed = signal(false);
  readonly clientCandidates = signal<ClientReference[]>([]);
  readonly caseCandidates = signal<CaseReference[]>([]);
  readonly categories = signal<ServiceCategory[]>([]);
  readonly organizationCurrency = signal<string | null>(null);
  readonly clientProfileCurrency = signal<string | null>(null);

  private readonly recentClients = signal<ClientReference[]>([]);
  private readonly listedClients = signal<ClientOption[]>([]);
  private readonly clientQuery = signal("");
  private readonly clientSearchTerms = new Subject<string>();
  private readonly pickedClients = signal<ClientOption[]>([]);
  private readonly listedCases = signal<CaseOption[]>([]);
  private readonly pickedCases = signal<CaseOption[]>([]);
  private readonly agreements = signal<AgreementTerms[] | null>(null);
  private readonly selectedClientId = signal(this.form.controls.clientId.value);
  /** True while a loaded entry's own values are applied to the form. */
  private hydrating = false;
  /** An existing entry keeps its treatment until client, date or category change. */
  private keepTreatment = Boolean(
    this.context.entryId || this.context.treatment,
  );
  private applyingCase = false;
  private micBaseText = "";

  /** Every client the form can currently label, whatever the search says. */
  private readonly knownClients = computed(() => {
    const byId = new Map<string, ClientOption>();
    for (const client of this.recentClients()) {
      byId.set(client.id, { id: client.id, name: client.displayName });
    }
    for (const client of [...this.pickedClients(), ...this.listedClients()]) {
      byId.set(client.id, client);
    }
    return byId;
  });
  /**
   * Without a search: recent clients first, then picked, then the rest. With a
   * search the server already filtered, so only its results are offered.
   */
  readonly clientOptions = computed(() => {
    const seen = new Set<string>();
    const options: ClientOption[] = [];
    const add = (option: ClientOption) => {
      if (seen.has(option.id)) return;
      seen.add(option.id);
      options.push(option);
    };
    if (!this.clientQuery()) {
      for (const client of this.recentClients()) {
        add({ id: client.id, name: client.displayName });
      }
      this.pickedClients().forEach(add);
    }
    this.listedClients().forEach(add);
    return options;
  });
  /** The server filters; the combobox must not filter the results again. */
  readonly acceptAll = () => true;
  readonly caseOptions = computed(() => {
    const clientId = this.selectedClientId();
    const byId = new Map<string, CaseOption>();
    for (const item of [...this.listedCases(), ...this.pickedCases()]) {
      if (!clientId || item.client.id === clientId) byId.set(item.id, item);
    }
    return [...byId.values()];
  });
  readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: "", label: "time.capture.noCategory" },
    ...this.categories().map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ]);

  readonly clientItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("time.capture.selectClient");
    return this.knownClients().get(value)?.name ?? "";
  };
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("time.capture.noCase");
    const item = this.caseOptions().find((candidate) => candidate.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : "";
  };
  readonly categoryItemToString = (value: string | null | undefined): string =>
    createSelectItemToString(this.categoryOptions(), (key) =>
      this.localization.translate(key),
    )(value);

  readonly users = signal<SelectOption[]>([]);
  readonly usersLoading = signal(false);
  readonly usersFailed = signal(false);
  readonly userOptions = computed(() => {
    const options = [...this.users()];
    const saved = this.loadedEntry()?.user;
    if (saved && !options.some((option) => option.value === saved.id))
      options.push({ value: saved.id, label: saved.displayName });
    return [{ value: "", label: "time.capture.unassigned" }, ...options];
  });
  readonly userItemToString = (value: string | null | undefined): string =>
    this.userOptions().some((option) => option.value === value)
      ? createSelectItemToString(this.userOptions(), (key) =>
          this.localization.translate(key),
        )(value)
      : "";

  private applySourceUser(userId: string | undefined): void {
    if (
      userId &&
      this.mode === "create" &&
      this.context.userId === undefined &&
      !this.form.controls.userId.dirty
    ) {
      this.form.controls.userId.setValue(userId, { emitEvent: false });
    }
  }

  loadUsers(): void {
    this.usersLoading.set(true);
    this.usersFailed.set(false);
    this.references
      .users()
      .pipe(
        finalize(() => this.usersLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (members) =>
          this.users.set(
            members.map((member) => ({
              value: member.userId,
              label:
                [member.user.firstName, member.user.lastName]
                  .filter(Boolean)
                  .join(" ") || member.user.email,
            })),
          ),
        error: () => this.usersFailed.set(true),
      });
  }

  constructor() {
    if (this.mode !== "view") this.loadUsers();
    effect((onCleanup) => {
      const id = this.linkedEventId();
      if (!id) return;
      const sub = this.eventsApi.get(id).subscribe({
        next: (event) => {
          this.linkedEvent.set(event);
          this.applySourceUser(
            event.assigneeUsers?.[0]?.id ?? event.organizerUser?.id,
          );
        },
        error: () => this.linkedEvent.set(null),
      });
      onCleanup(() => sub.unsubscribe());
    });
    effect((onCleanup) => {
      const id = this.linkedTaskId();
      if (!id) return;
      const subscription = this.tasksApi.getTask(id).subscribe({
        next: (task) => {
          this.linkedTask.set(task);
          this.applySourceUser(task.assigneeUser?.id);
        },
        // The header button remains available to retry the task lookup.
        error: () => this.linkedTask.set(null),
      });
      onCleanup(() => subscription.unsubscribe());
    });
    if (this.mode === "view") {
      if (this.context.entryId) this.hydrateFromEntry(this.context.entryId);
      else this.entryLoadFailed.set(true);
      return;
    }
    const { clientId, caseId, workDate, serviceCategoryId } =
      this.form.controls;

    clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.selectedClientId.set(value);
        if (!value && this.eventLinked()) {
          this.form.controls.treatment.setValue("NON_BILLABLE", {
            emitEvent: false,
          });
          this.form.controls.value.setValue("", { emitEvent: false });
        }
        if (!this.applyingCase && caseId.value) {
          caseId.setValue("", { emitEvent: false });
        }
        if (!this.hydrating && !this.context.treatment)
          this.keepTreatment = false;
      });
    for (const control of [workDate, serviceCategoryId]) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (this.hydrating || this.context.treatment) return;
          this.keepTreatment = false;
          this.applyDefaultTreatment();
        });
    }

    const client$ = clientId.valueChanges.pipe(
      startWith(clientId.value),
      distinctUntilChanged(),
    );
    this.organizationSettingsApi
      .get()
      .pipe(
        map((settings) => settings.currency?.defaultCurrencyCode ?? null),
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((currency) => {
        this.organizationCurrency.set(currency);
        this.applyDefaultCurrency();
      });
    client$
      .pipe(
        tap(() => this.clientProfileCurrency.set(null)),
        switchMap((id) =>
          id
            ? this.billingApi.getProfile(id).pipe(
                map((profile) => profile.currency),
                catchError(() => of(null)),
              )
            : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((currency) => {
        this.clientProfileCurrency.set(currency);
        this.applyDefaultCurrency();
      });
    client$
      .pipe(
        switchMap((id) =>
          this.casesApi
            .list(
              id
                ? { clientId: id, page: 1, pageSize: LIST_PAGE_SIZE }
                : { page: 1, pageSize: LIST_PAGE_SIZE },
            )
            .pipe(
              map((response) => response.items),
              catchError(() => of([] as CaseOption[])),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.listedCases.set(items));
    client$
      .pipe(
        tap(() => this.agreements.set(null)),
        switchMap((id) =>
          id && !this.fromSource
            ? this.billingApi.listRetainers(id).pipe(
                map((items) => agreementTerms(items)),
                // Non-managers may not read retainers: the API then decides.
                catchError(() => of(null)),
              )
            : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((terms) => {
        this.agreements.set(terms);
        if (!this.keepTreatment) this.applyDefaultTreatment();
      });

    this.clientSearchTerms
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((term) => term.trim()),
        startWith(""),
        distinctUntilChanged(),
        tap((term) => this.clientQuery.set(term)),
        switchMap((term) =>
          this.clientsApi
            .list({
              page: 1,
              pageSize: LIST_PAGE_SIZE,
              status: "ACTIVE",
              ...(term ? { search: term } : {}),
            })
            .pipe(
              map((response) =>
                response.items.map((item) => ({
                  id: item.id,
                  name: item.displayName,
                })),
              ),
              catchError(() => of([] as ClientOption[])),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.listedClients.set(items));
    this.billingApi
      .listCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.categories.set(items.filter((item) => item.active)),
        error: () => undefined,
      });
    const userId = this.auth.session()?.user.id;
    if (userId && !this.fromSource) {
      this.entriesApi
        .list({ userIds: [userId], page: 1, pageSize: RECENT_ENTRY_COUNT })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) =>
            this.recentClients.set(uniqueClients(response.items)),
          error: () => undefined,
        });
    }
    if (clientId.value) this.ensureClientKnown(clientId.value);
    if (caseId.value)
      this.applyCaseById(caseId.value, clientId.value || null, false);
    if (this.context.entryId) this.hydrateFromEntry(this.context.entryId);

    effect(() => {
      const error = this.speech.error();
      if (error) this.toast.error(error);
    });
    effect(() => {
      const text = [this.speech.transcript(), this.speech.interimTranscript()]
        .filter(Boolean)
        .join(" ");
      if (!text) return;
      this.form.controls.title.setValue(
        [this.micBaseText, text].filter(Boolean).join(" "),
      );
    });
    this.destroyRef.onDestroy(() => this.speech.reset());
  }

  // ------------------------------------------------------------------ UI

  readonly titleKey = TITLE_KEYS[this.mode];

  searchClients(term: string): void {
    this.clientSearchTerms.next(term);
  }

  setClientId(value: string | null | undefined): void {
    const known = value ? this.knownClients().get(value) : undefined;
    if (known) this.applyClient(known);
    else this.form.controls.clientId.setValue(value ?? "");
    this.form.controls.clientId.markAsTouched();
  }

  setCaseId(value: string | null | undefined): void {
    const caseId = value ?? "";
    const item = this.caseOptions().find(
      (candidate) => candidate.id === caseId,
    );
    if (item) this.selectCase(item);
    else this.form.controls.caseId.setValue(caseId);
  }

  setMinutes(minutes: number): void {
    this.form.controls.minutes.setValue(minutes);
    this.form.controls.minutes.markAsDirty();
  }

  toggleMic(): void {
    if (this.readOnly() || this.saving()) return;
    if (!this.speech.isListening()) {
      this.micBaseText = this.form.controls.title.value.trimEnd();
      this.speech.setLanguage(
        this.localization.language() === "EN" ? "en-US" : "sr-RS",
      );
    }
    this.speech.toggle();
  }

  // ------------------------------------------------------------ AI fill

  fillFromText(): void {
    if (this.readOnly() || this.saving()) return;
    const text = this.form.controls.title.value.trim();
    if (!text || this.parsing()) return;
    if (this.speech.isListening()) this.speech.stop();
    this.parsing.set(true);
    this.parseFailed.set(false);
    this.entriesApi
      .parse({ text })
      .pipe(
        finalize(() => this.parsing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this.applyParse(result),
        error: () => this.parseFailed.set(true),
      });
  }

  pickClientCandidate(client: ClientReference): void {
    this.applyClient({ id: client.id, name: client.displayName });
    this.clientCandidates.set([]);
    this.aiParsed.set(true);
  }

  pickCaseCandidate(item: CaseReference): void {
    this.applyCaseById(item.id, null);
    this.caseCandidates.set([]);
  }

  private applyParse(result: WorkCaptureParseResponse): void {
    this.clientCandidates.set([]);
    this.caseCandidates.set([]);
    if (!result.ok) {
      this.parseFailed.set(true);
      return;
    }
    const { minutes, serviceCategoryId, title } = this.form.controls;
    let filled = false;
    // A matched case only counts once its lookup has filled the form.
    const caseLookup = Boolean(result.caseId);

    if (result.clientId) {
      this.applyClient({ id: result.clientId, name: "" });
      this.ensureClientKnown(result.clientId);
      filled = true;
    } else {
      this.clientCandidates.set(result.clientCandidates);
    }
    if (result.caseId) {
      this.applyCaseById(result.caseId, result.clientId);
    } else {
      this.caseCandidates.set(result.caseCandidates);
    }
    if (result.minutes !== null) {
      minutes.setValue(result.minutes);
      filled = true;
    }
    if (
      result.serviceCategoryId &&
      this.categories().some((item) => item.id === result.serviceCategoryId)
    ) {
      serviceCategoryId.setValue(result.serviceCategoryId);
      filled = true;
    }
    // The parsed summary drops the client and duration the user typed.
    if (result.description) {
      title.setValue(result.description.slice(0, TITLE_MAX_LENGTH));
      filled = true;
    }
    if (filled) this.aiParsed.set(true);
    // Nothing usable came back: same hint as a failed call.
    else if (
      !caseLookup &&
      !this.clientCandidates().length &&
      !this.caseCandidates().length
    ) {
      this.parseFailed.set(true);
    }
  }

  /** Loads the case, derives the client from it when the client is unknown. */
  private applyCaseById(
    caseId: string,
    expectedClientId: string | null,
    parsed = true,
  ): void {
    this.casesApi
      .get(caseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (!parsed && this.form.controls.caseId.value !== caseId) return;
          if (expectedClientId && detail.client.id !== expectedClientId) {
            if (parsed) this.caseLookupFailed();
            return;
          }
          this.selectCase(detail);
          if (parsed) this.aiParsed.set(true);
        },
        error: () => {
          if (parsed) this.caseLookupFailed();
        },
      });
  }

  private caseLookupFailed(): void {
    if (!this.aiParsed()) this.parseFailed.set(true);
  }

  private selectCase(item: CaseOption): void {
    this.pickedCases.update((items) => [
      ...items.filter((existing) => existing.id !== item.id),
      item,
    ]);
    const { clientId, caseId } = this.form.controls;
    if (clientId.value !== item.client.id) {
      this.applyingCase = true;
      this.applyClient({ id: item.client.id, name: item.client.displayName });
      this.applyingCase = false;
    }
    caseId.setValue(item.id);
  }

  private applyClient(client: ClientOption): void {
    if (client.name) {
      this.pickedClients.update((items) => [
        ...items.filter((existing) => existing.id !== client.id),
        client,
      ]);
    }
    this.form.controls.clientId.setValue(client.id);
  }

  /** The combobox needs a label for a client that is not in the lists yet. */
  private ensureClientKnown(id: string): void {
    if (this.clientOptions().some((client) => client.id === id)) return;
    this.clientsApi
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) =>
          this.pickedClients.update((items) => [
            ...items,
            { id: detail.id, name: detail.displayName },
          ]),
        error: () => undefined,
      });
  }

  // ----------------------------------------------------------- treatment

  private applyDefaultTreatment(): void {
    const { treatment, workDate, serviceCategoryId } = this.form.controls;
    if (!this.form.controls.clientId.value && this.eventLinked()) {
      treatment.setValue("NON_BILLABLE", { emitEvent: false });
      return;
    }
    const agreements = this.agreements();
    if (treatment.dirty || agreements === null) return;
    const agreement = activeAgreementOn(
      agreements,
      new Date(`${workDate.value}T00:00:00Z`),
    );
    treatment.setValue(
      defaultTreatment(agreement, serviceCategoryId.value || null),
      { emitEvent: false },
    );
  }

  private applyDefaultCurrency(): void {
    if (
      this.context.currency !== undefined ||
      this.loadedEntry() ||
      this.form.controls.currency.dirty
    ) {
      return;
    }
    const supported = (currency: string | null): currency is string =>
      !!currency &&
      CURRENCY_OPTIONS.some(
        (option) => option.value === currency.toUpperCase(),
      );
    const currency = [
      this.clientProfileCurrency(),
      this.organizationCurrency(),
      "RSD",
    ].find(supported);
    if (currency) {
      this.form.controls.currency.setValue(currency.toUpperCase(), {
        emitEvent: false,
      });
    }
  }

  /** What to send: a deliberate pick, or the default shown; else let the API decide. */
  private treatmentToSend(): WorkEntryTreatment | undefined {
    const { treatment } = this.form.controls;
    if (treatment.dirty || this.context.treatment) return treatment.value;
    if (this.keepTreatment || this.agreements() === null) return undefined;
    return treatment.value;
  }

  // ------------------------------------------------------------- editing

  retryLoadEntry(): void {
    if (!this.loadingEntry()) this.hydrateFromEntry(this.requiredEntryId());
  }

  private hydrateFromEntry(entryId: string): void {
    this.loadingEntry.set(true);
    this.entryLoadFailed.set(false);
    forkJoin({
      entry: this.entriesApi.get(entryId),
      actions:
        this.managingEntry && this.mode !== "view"
          ? this.entriesApi.actions(entryId)
          : of(null),
    })
      .pipe(
        finalize(() => this.loadingEntry.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ entry, actions }) => {
          this.entryActions.set(actions);
          this.loadedEntry.set(entry);
          this.linkedEventId.set(
            this.context.eventId ??
              entry.eventId ??
              (entry.sourceType === "EVENT"
                ? (entry.sourceId ?? undefined)
                : undefined),
          );
          this.linkedTaskId.set(
            this.context.taskId ?? entry.taskId ?? undefined,
          );
          if (!this.readOnly()) this.hydrate(entry);
          if (this.readOnly()) this.form.disable({ emitEvent: false });
        },
        error: () => this.entryLoadFailed.set(true),
      });
  }

  deleteEntry(): void {
    if (
      this.readOnly() ||
      !this.managingEntry ||
      this.saving() ||
      this.loadingEntry() ||
      !this.entryActions()?.canDelete
    )
      return;
    this.saving.set(true);
    const id = this.requiredEntryId();
    this.entriesApi
      .actions(id)
      .pipe(
        switchMap((actions) => {
          this.entryActions.set(actions);
          if (!actions.canDelete) {
            this.toast.info(
              this.localization.translate(
                this.deletionInfoKey() ?? "work.entries.deleteNotAllowed",
              ),
            );
            return of(false);
          }
          return this.confirm.confirm({
            title: this.localization.translate("work.entries.deleteTitle"),
            message: this.localization.translate("work.entries.deleteConfirm"),
            confirmText: "common.delete",
            variant: "danger",
          });
        }),
        filter((confirmed) => confirmed),
        switchMap(() => this.entriesApi.remove(id)),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(
            this.localization.translate("work.entries.deleted"),
          );
          this.context.onDeleted?.();
          this.dialogRef.close();
        },
        error: (error: HttpErrorResponse) => {
          if (error.error?.code === "LAST_TASK_WORK_ENTRY") {
            const current = this.entryActions();
            if (current)
              this.entryActions.set({
                ...current,
                canDelete: false,
                deleteBlockedReason: "LAST_TASK_ENTRY",
              });
            this.toast.info(
              this.localization.translate("work.entries.lastEntryInfo"),
            );
          } else {
            this.toast.error(
              this.localization.translate("work.entries.deleteError"),
            );
          }
        },
      });
  }

  private hydrate(entry: WorkEntry): void {
    this.linkedTaskId.set(this.context.taskId ?? entry.taskId ?? undefined);
    const controls = this.form.controls;
    this.hydrating = true;
    if (entry.eventId || entry.sourceType === "EVENT") {
      this.eventLinked.set(true);
      controls.clientId.clearValidators();
      controls.clientId.updateValueAndValidity({ emitEvent: false });
    }
    controls.userId.setValue(entry.user?.id ?? "", { emitEvent: false });
    // Values the caller passed in win over the stored ones.
    if (!this.context.clientId && entry.client) {
      this.applyClient({ id: entry.client.id, name: entry.client.displayName });
    }
    const entryCase = entry.case;
    const entryClient = entry.client;
    if (!this.context.caseId && entryCase && entryClient) {
      this.pickedCases.update((items) => [
        ...items,
        { ...entryCase, client: entryClient },
      ]);
      controls.caseId.setValue(entryCase.id, { emitEvent: false });
    }
    if (this.context.minutes === undefined && entry.minutes !== null) {
      controls.minutes.setValue(entry.minutes);
    }
    if (!this.context.title) controls.title.setValue(entry.title);
    if (!this.context.description)
      controls.description.setValue(entry.description);
    if (!this.context.workDate) controls.workDate.setValue(entry.workDate);
    controls.serviceCategoryId.setValue(entry.serviceCategory?.id ?? "");
    controls.treatment.setValue(entry.treatment, { emitEvent: false });
    if (this.context.value === undefined) {
      controls.value.setValue(entry.value ?? "", { emitEvent: false });
    }
    if (this.context.currency === undefined) {
      controls.currency.setValue(entry.currency ?? "", { emitEvent: false });
    }
    controls.treatment.markAsPristine();
    this.hydrating = false;
    this.keepTreatment = true;
  }

  // ---------------------------------------------------------------- save

  submit(): void {
    if (this.saving() || this.readOnly() || this.entryLoadFailed()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.persist(this.save(), "time.capture.saved");
  }

  finishWithoutNewWork(): void {
    if (this.readOnly() || this.saving() || !this.context.finishWithoutNewWork)
      return;
    this.persist(this.context.finishWithoutNewWork(), "work.taskFinished");
  }

  private persist(operation: Observable<unknown>, successKey: string): void {
    this.saving.set(true);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (entry) => {
        this.toast.success(this.localization.translate(successKey));
        this.dialogRef.close(entry);
      },
      error: () => {
        this.toast.error(this.localization.translate("time.capture.saveError"));
        this.saving.set(false);
      },
    });
  }

  private save(): Observable<unknown> {
    const value = this.form.getRawValue();
    // Empty means untimed; null also clears time on an existing entry.
    const minutes = value.minutes ?? null;
    const title = value.title.trim();
    const description = value.description.trim();
    const fields = {
      userId: value.userId || null,
      taskId: this.context.taskId,
      clientId: value.clientId || null,
      // The update contract cannot clear a case or category, only set them.
      caseId: value.caseId || undefined,
      workDate: value.workDate,
      minutes,
      title,
      description,
      serviceCategoryId: value.serviceCategoryId || undefined,
      treatment: this.treatmentToSend(),
      value: normalizeWorkValue(value.value),
      currency: value.currency || null,
    };
    const aiParsed = this.aiParsed();

    if (this.context.save) {
      return this.context.save({ ...fields, aiParsed });
    }

    switch (this.mode) {
      case "create":
        return this.entriesApi.create({
          ...fields,
          eventId: this.context.eventId,
          source: aiParsed ? "QUICK_CAPTURE" : "MANUAL",
          aiParsed,
        });
      case "confirm-timer": {
        const { userId, ...timerFields } = fields;
        return this.entriesApi
          .update(this.requiredEntryId(), {
            ...timerFields,
            ...(aiParsed ? { aiParsed } : {}),
          })
          .pipe(
            switchMap(() =>
              this.entriesApi.confirm(this.requiredEntryId(), {
                userId,
                minutes,
                title,
                description,
                value: normalizeWorkValue(value.value),
                currency: value.currency || null,
              }),
            ),
          );
      }
      case "confirm-source": {
        const source = this.context.source;
        if (!source) {
          return throwError(() => new Error("A source is required to confirm"));
        }
        return this.entriesApi.confirmFromSource({
          userId: value.userId || null,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          minutes,
          title,
          description,
          value: normalizeWorkValue(value.value),
          currency: value.currency || null,
        });
      }
      case "view":
        return throwError(() => new Error("Viewed entries cannot be saved"));
      case "edit":
        return this.entriesApi.update(this.requiredEntryId(), {
          ...fields,
          ...(this.loadedEntry()?.status === "WRITTEN_OFF" &&
          this.restoredStatus.value === "CONFIRMED"
            ? { status: "CONFIRMED" as const }
            : {}),
          ...(aiParsed ? { aiParsed } : {}),
        });
    }
  }

  private requiredEntryId(): string {
    if (!this.context.entryId) throw new Error("An entry id is required");
    return this.context.entryId;
  }
}

function uniqueClients(entries: WorkEntry[]): ClientReference[] {
  const seen = new Set<string>();
  const clients: ClientReference[] = [];
  for (const entry of entries) {
    if (!entry.client) continue;
    if (seen.has(entry.client.id)) continue;
    seen.add(entry.client.id);
    clients.push(entry.client);
  }
  return clients;
}
