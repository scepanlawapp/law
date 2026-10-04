import {
  Component,
  computed,
  DestroyRef,
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
import {
  BillingSetupApiClient,
  CasesApiClient,
  ClientsApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import {
  CaseReference,
  ClientReference,
  ServiceCategory,
  WorkCaptureParseResponse,
  WorkEntry,
  WorkEntryTreatment,
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
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import {
  catchError,
  distinctUntilChanged,
  finalize,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  tap,
  throwError,
} from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { SpeechRecognitionService } from "../../../core/speech/speech-recognition.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { createSelectItemToString, SelectOption } from "../../../shared/utils";
import {
  activeAgreementOn,
  AgreementTerms,
  agreementTerms,
  defaultTreatment,
} from "../treatment";
import { QuickCaptureInput } from "./quick-capture.models";

const OFFICE_TIME_ZONE = "Europe/Belgrade";
const RECENT_ENTRY_COUNT = 20;
const LIST_PAGE_SIZE = 100;

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
    HlmTextarea,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideMic, lucideMicOff })],
})
export class QuickCaptureDialogComponent {
  private readonly entriesApi = inject(WorkEntriesApiClient);
  private readonly billingApi = inject(BillingSetupApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly auth = inject(AuthState);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = injectBrnDialogContext<QuickCaptureInput>();
  protected readonly speech = inject(SpeechRecognitionService);
  readonly dialogRef = inject(BrnDialogRef<WorkEntry | undefined>);

  readonly mode = this.context.mode;
  /** Source confirmations take client, case and treatment from the source. */
  readonly fromSource = this.mode === "confirm-source";
  readonly minuteChips = [15, 30, 60, 120] as const;
  readonly treatmentOptions: SelectOption<WorkEntryTreatment>[] = [
    { value: "RETAINER", label: "time.treatment.retainer" },
    { value: "AT", label: "time.treatment.at" },
    { value: "HOURLY", label: "time.treatment.hourly" },
    { value: "NON_BILLABLE", label: "time.treatment.nonBillable" },
    { value: "UNDECIDED", label: "time.treatment.undecided" },
  ];
  readonly treatmentItemToString = createSelectItemToString(
    this.treatmentOptions,
    (key) => this.localization.translate(key),
  );

  readonly form = new FormGroup({
    clientId: new FormControl(this.context.clientId ?? "", {
      nonNullable: true,
      validators: this.fromSource ? [] : [Validators.required],
    }),
    caseId: new FormControl(this.context.caseId ?? "", { nonNullable: true }),
    minutes: new FormControl<number | null>(this.context.minutes ?? null, {
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(1440),
      ],
    }),
    workDate: new FormControl(this.context.workDate ?? today(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl(this.context.description ?? "", {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    serviceCategoryId: new FormControl("", { nonNullable: true }),
    treatment: new FormControl<WorkEntryTreatment>("UNDECIDED", {
      nonNullable: true,
    }),
  });
  /** Free text for AI fill; deliberately not part of the saved form. */
  readonly freeText = new FormControl("", { nonNullable: true });

  readonly saving = signal(false);
  readonly loadingEntry = signal(false);
  readonly parsing = signal(false);
  readonly parseFailed = signal(false);
  readonly aiParsed = signal(false);
  readonly clientCandidates = signal<ClientReference[]>([]);
  readonly caseCandidates = signal<CaseReference[]>([]);
  readonly categories = signal<ServiceCategory[]>([]);

  private readonly recentClients = signal<ClientReference[]>([]);
  private readonly listedClients = signal<ClientOption[]>([]);
  private readonly pickedClients = signal<ClientOption[]>([]);
  private readonly listedCases = signal<CaseOption[]>([]);
  private readonly pickedCases = signal<CaseOption[]>([]);
  private readonly agreements = signal<AgreementTerms[] | null>(null);
  private readonly selectedClientId = signal(this.form.controls.clientId.value);
  /** True while a loaded entry's own values are applied to the form. */
  private hydrating = false;
  /** An existing entry keeps its treatment until client, date or category change. */
  private keepTreatment = Boolean(this.context.entryId);
  private applyingCase = false;
  private micBaseText = "";

  /** Recent clients first, then the picked ones, then the rest. */
  readonly clientOptions = computed(() => {
    const seen = new Set<string>();
    const options: ClientOption[] = [];
    const add = (option: ClientOption) => {
      if (seen.has(option.id)) return;
      seen.add(option.id);
      options.push(option);
    };
    for (const client of this.recentClients()) {
      add({ id: client.id, name: client.displayName });
    }
    this.pickedClients().forEach(add);
    this.listedClients().forEach(add);
    return options;
  });
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
    return (
      this.clientOptions().find((client) => client.id === value)?.name ?? ""
    );
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

  constructor() {
    const { clientId, caseId, workDate, serviceCategoryId } =
      this.form.controls;

    clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.selectedClientId.set(value);
        if (!this.applyingCase && caseId.value) {
          caseId.setValue("", { emitEvent: false });
        }
        if (!this.hydrating) this.keepTreatment = false;
      });
    for (const control of [workDate, serviceCategoryId]) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (this.hydrating) return;
          this.keepTreatment = false;
          this.applyDefaultTreatment();
        });
    }

    const client$ = clientId.valueChanges.pipe(
      startWith(clientId.value),
      distinctUntilChanged(),
    );
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

    this.clientsApi
      .list({ page: 1, pageSize: LIST_PAGE_SIZE, status: "ACTIVE" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.listedClients.set(
            response.items.map((item) => ({
              id: item.id,
              name: item.displayName,
            })),
          ),
        error: () => undefined,
      });
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
      this.freeText.setValue(
        [this.micBaseText, text].filter(Boolean).join(" "),
      );
    });
    this.destroyRef.onDestroy(() => this.speech.reset());
  }

  // ------------------------------------------------------------------ UI

  readonly titleKey = TITLE_KEYS[this.mode];

  setClientId(value: string | null | undefined): void {
    this.form.controls.clientId.setValue(value ?? "");
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
    if (!this.speech.isListening()) {
      this.micBaseText = this.freeText.value.trimEnd();
      this.speech.setLanguage(
        this.localization.language() === "EN" ? "en-US" : "sr-RS",
      );
    }
    this.speech.toggle();
  }

  // ------------------------------------------------------------ AI fill

  fillFromText(): void {
    const text = this.freeText.value.trim();
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
    this.aiParsed.set(true);
  }

  private applyParse(result: WorkCaptureParseResponse): void {
    this.clientCandidates.set([]);
    this.caseCandidates.set([]);
    if (!result.ok) {
      this.parseFailed.set(true);
      return;
    }
    const { minutes, serviceCategoryId, description } = this.form.controls;
    let filled = false;

    if (result.clientId) {
      this.applyClient({ id: result.clientId, name: "" });
      this.ensureClientKnown(result.clientId);
      filled = true;
    } else {
      this.clientCandidates.set(result.clientCandidates);
    }
    if (result.caseId) {
      this.applyCaseById(result.caseId, result.clientId);
      filled = true;
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
    if (result.description) {
      description.setValue(result.description);
      filled = true;
    }
    if (filled) this.aiParsed.set(true);
    // Nothing usable came back: same hint as a failed call.
    else if (!this.clientCandidates().length && !this.caseCandidates().length) {
      this.parseFailed.set(true);
    }
  }

  /** Loads the case, derives the client from it when the client is unknown. */
  private applyCaseById(caseId: string, expectedClientId: string | null): void {
    this.casesApi
      .get(caseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (expectedClientId && detail.client.id !== expectedClientId) return;
          this.selectCase(detail);
        },
        error: () => undefined,
      });
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

  /** What to send: a deliberate pick, or the default shown; else let the API decide. */
  private treatmentToSend(): WorkEntryTreatment | undefined {
    const { treatment } = this.form.controls;
    if (treatment.dirty) return treatment.value;
    if (this.keepTreatment || this.agreements() === null) return undefined;
    return treatment.value;
  }

  // ------------------------------------------------------------- editing

  private hydrateFromEntry(entryId: string): void {
    this.loadingEntry.set(true);
    this.entriesApi
      .get(entryId)
      .pipe(
        finalize(() => this.loadingEntry.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (entry) => this.hydrate(entry),
        error: () => undefined,
      });
  }

  private hydrate(entry: WorkEntry): void {
    const controls = this.form.controls;
    this.hydrating = true;
    // Values the caller passed in win over the stored ones.
    if (!this.context.clientId) {
      this.applyClient({ id: entry.client.id, name: entry.client.displayName });
    }
    const entryCase = entry.case;
    if (!this.context.caseId && entryCase) {
      this.pickedCases.update((items) => [
        ...items,
        { ...entryCase, client: entry.client },
      ]);
      controls.caseId.setValue(entryCase.id, { emitEvent: false });
    }
    if (this.context.minutes === undefined && entry.minutes !== null) {
      controls.minutes.setValue(entry.minutes);
    }
    if (!this.context.description)
      controls.description.setValue(entry.description);
    if (!this.context.workDate) controls.workDate.setValue(entry.workDate);
    controls.serviceCategoryId.setValue(entry.serviceCategory?.id ?? "");
    controls.treatment.setValue(entry.treatment, { emitEvent: false });
    controls.treatment.markAsPristine();
    this.hydrating = false;
    this.keepTreatment = true;
  }

  // ---------------------------------------------------------------- save

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.save()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.toast.success(this.localization.translate("time.capture.saved"));
          this.dialogRef.close(entry);
        },
        error: () => {
          this.toast.error(
            this.localization.translate("time.capture.saveError"),
          );
          this.saving.set(false);
        },
      });
  }

  private save(): Observable<WorkEntry> {
    const value = this.form.getRawValue();
    const minutes = value.minutes as number;
    const description = value.description.trim();
    const fields = {
      clientId: value.clientId,
      // The update contract cannot clear a case or category, only set them.
      caseId: value.caseId || undefined,
      workDate: value.workDate,
      minutes,
      description,
      serviceCategoryId: value.serviceCategoryId || undefined,
      treatment: this.treatmentToSend(),
    };
    const aiParsed = this.aiParsed();

    switch (this.mode) {
      case "create":
        return this.entriesApi.create({
          ...fields,
          source: aiParsed ? "QUICK_CAPTURE" : "MANUAL",
          aiParsed,
        });
      case "confirm-timer":
        return this.entriesApi
          .update(this.requiredEntryId(), {
            ...fields,
            ...(aiParsed ? { aiParsed } : {}),
          })
          .pipe(
            switchMap(() =>
              this.entriesApi.confirm(this.requiredEntryId(), {
                minutes,
                description,
              }),
            ),
          );
      case "confirm-source": {
        const source = this.context.source;
        if (!source) {
          return throwError(() => new Error("A source is required to confirm"));
        }
        return this.entriesApi.confirmFromSource({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          minutes,
          description,
        });
      }
      case "edit":
        return this.entriesApi.update(this.requiredEntryId(), {
          ...fields,
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
    if (seen.has(entry.client.id)) continue;
    seen.add(entry.client.id);
    clients.push(entry.client);
  }
  return clients;
}
