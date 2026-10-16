import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { KeyValuePipe } from "@angular/common";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  ActivityType,
  CaseDetail,
  CaseStatus,
  DocumentSummary,
  CaseResponsibility,
  CaseLinksResponse,
  DomainActivity,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import {
  CasesApiClient,
  ChatApiClient,
  DocumentsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import {
  FIRST_PAGE,
  PageState,
  injectPaginatedList,
} from "../../shared/pagination/paginated-list";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import {
  HlmTabs,
  HlmTabsContent,
  HlmTabsList,
  HlmTabsTrigger,
} from "@spartan-ng/helm/tabs";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { DocumentsComponent } from "../documents/documents.component";
import { WorkViewComponent } from "../work-management/work-view/work-view.component";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { integerValidator } from "../time/validators";
import {
  STATUS_BADGE_BASE_CLASSES,
  priorityBadgeClass as sharedPriorityBadgeClass,
  statusBadgeClass as sharedStatusBadgeClass,
} from "../../shared/status-badge";
import {
  ACTIVITY_SOURCE_LABELS,
  ACTIVITY_TYPE_LABELS,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  DRAFT_APPROVAL_STATUS_LABELS,
  DRAFT_DOCUMENT_TYPE_LABELS,
  TIMED_ACTIVITY_TYPES,
  labelOf,
} from "../../shared/models";

type CaseTab =
  | "overview"
  | "activities"
  | "work"
  | "documents"
  | "assistant"
  | "responsibilities";

@Component({
  selector: "law-case-detail",
  standalone: true,
  templateUrl: "./case-detail.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    PaginationComponent,
    HlmSelectImports,
    HlmSpinner,
    HlmTextarea,
    HlmTabs,
    HlmTabsContent,
    HlmTabsList,
    HlmTabsTrigger,
    KeyValuePipe,
    TranslatePipe,
    WorkViewComponent,
    DocumentsComponent,
  ],
})
export class CaseDetailComponent {
  protected readonly CaseStatus = CaseStatus;
  readonly statusLabels = CASE_STATUS_LABELS;
  readonly priorityLabels = CASE_PRIORITY_LABELS;
  readonly activitySourceLabels = ACTIVITY_SOURCE_LABELS;
  readonly draftDocumentTypeLabels = DRAFT_DOCUMENT_TYPE_LABELS;
  readonly draftApprovalStatusLabels = DRAFT_APPROVAL_STATUS_LABELS;
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  private readonly api = inject(CasesApiClient);
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly chat = inject(ChatApiClient);
  private readonly auth = inject(AuthState);
  private readonly refs = inject(ReferencesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get("caseId") ?? "";
  readonly item = signal<CaseDetail | null>(null);
  readonly loading = signal(true);
  readonly selectedTab = signal<CaseTab>("overview");
  readonly activitySearch = new FormControl("", { nonNullable: true });
  readonly activityTypes = signal<ActivityType[]>([]);
  readonly activityList = injectPaginatedList<DomainActivity>({
    fetch: (request) =>
      this.api.listActivities(this.id, {
        search: this.activitySearch.value.trim() || undefined,
        types: this.activityTypes().length ? this.activityTypes() : undefined,
        ...request,
      }),
    onError: () => this.toast.error(this.local.translate("cases.loadError")),
  });
  readonly activities = this.activityList.items;
  readonly activitiesLoading = this.activityList.loading;
  readonly activitiesTotal = this.activityList.totalItems;
  readonly responsibilityList = injectPaginatedList<CaseResponsibility>({
    fetch: (request) => this.api.listResponsibilities(this.id, request),
    onError: () => this.toast.error(this.local.translate("cases.loadError")),
  });
  readonly responsibilities = this.responsibilityList.items;
  readonly responsibilitiesLoading = this.responsibilityList.loading;
  readonly responsibilitiesTotal = this.responsibilityList.totalItems;
  readonly documents = signal<DocumentSummary[]>([]);
  readonly documentsLoading = signal(false);
  readonly documentsLoaded = signal(false);
  readonly documentsTotal = signal(0);
  readonly users = signal(new Map<string, string>());
  readonly tags = signal(new Map<string, string>());
  readonly caseTypes = signal(new Map<string, string>());
  readonly practiceAreas = signal(new Map<string, string>());
  readonly showCloseForm = signal(false);
  readonly showActivityForm = signal(false);
  readonly assistantLinks = signal<CaseLinksResponse | null>(null);
  private assistantRequest = 0;
  readonly assistantLoading = signal(false);
  readonly assistantSessions: PageState = new PageState({
    loading: this.assistantLoading,
    onChange: () =>
      this.changeAssistantPage(this.assistantSessions, this.assistantDrafts),
  });
  readonly assistantDrafts: PageState = new PageState({
    loading: this.assistantLoading,
    onChange: () =>
      this.changeAssistantPage(this.assistantDrafts, this.assistantSessions),
  });

  readonly activityTypeOptions = Object.values(ActivityType);
  readonly activityTypeItemToString = (
    value: ActivityType | string | null | undefined,
  ): string =>
    labelOf(ACTIVITY_TYPE_LABELS, value, (key) => this.local.translate(key));
  readonly selectedActivityTypesLabel = computed(() =>
    this.activityTypes().map(this.activityTypeItemToString).join(", "),
  );
  readonly userItemToString = (value: string | null | undefined): string =>
    this.users().get(value ?? "") ?? "";
  readonly recentActivities = computed(() =>
    [...this.activities()]
      .sort(
        (first, second) =>
          new Date(second.activityDate).getTime() -
          new Date(first.activityDate).getTime(),
      )
      .slice(0, 5),
  );
  readonly recentDocuments = computed(() => this.documents().slice(0, 3));
  readonly caseTypeLabel = computed(() => {
    const item = this.item();
    if (!item) return "—";
    const mapped = this.caseTypes().get(item.caseTypeId ?? "");
    if (mapped) return mapped;
    if (item.caseTypeId) {
      // TODO(case-type-label): Resolve caseTypeId to its reference-data display name.
      return item.caseTypeId;
    }
    return "—";
  });
  readonly practiceAreaLabel = computed(() => {
    const item = this.item();
    if (!item) return "—";
    const mapped = this.practiceAreas().get(item.practiceAreaId ?? "");
    if (mapped) return mapped;
    if (item.practiceAreaId) {
      // TODO(practice-area-label): Resolve practiceAreaId to its display name.
      return item.practiceAreaId;
    }
    return "—";
  });
  readonly closeForm = new FormGroup({
    closedDate: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    closingNote: new FormControl("", {
      validators: [Validators.maxLength(10000)],
    }),
  });
  readonly activityForm = new FormGroup({
    type: new FormControl<ActivityType>(ActivityType.NOTE, {
      nonNullable: true,
    }),
    title: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl(""),
    activityDate: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    durationMinutes: new FormControl<number | null>(
      { value: null, disabled: true },
      {
        validators: [integerValidator, Validators.min(1), Validators.max(1440)],
      },
    ),
  });
  readonly activityMinuteChips = [15, 30, 60, 120] as const;
  private readonly selectedActivityType = toSignal(
    this.activityForm.controls.type.valueChanges,
    { initialValue: this.activityForm.controls.type.value },
  );
  /** Only calls, meetings and emails take a duration. */
  readonly activityTakesDuration = computed(() =>
    TIMED_ACTIVITY_TYPES.includes(this.selectedActivityType()),
  );
  private readonly syncActivityDuration =
    this.activityForm.controls.type.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((type) => {
        const control = this.activityForm.controls.durationMinutes;
        if (TIMED_ACTIVITY_TYPES.includes(type)) {
          control.enable();
        } else {
          // A hidden, stale value must neither block submit nor be sent.
          control.reset(null);
          control.disable();
        }
      });
  readonly responsibilityForm = new FormGroup({
    userId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    startedAt: new FormControl(""),
    isPrimary: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    this.activitySearch.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.activityList.reset());
    this.refs
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.users.set(
            new Map(
              items.map((item) => [
                item.userId,
                [item.user.firstName, item.user.lastName]
                  .filter(Boolean)
                  .join(" ") || item.user.email,
              ]),
            ),
          ),
      });
    this.refs
      .tags()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.tags.set(new Map(items.map((item) => [item.id, item.name]))),
      });
    this.refs
      .caseTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.caseTypes.set(
            new Map(items.map((item) => [item.id, item.name])),
          ),
      });
    this.refs
      .practiceAreas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.practiceAreas.set(
            new Map(items.map((item) => [item.id, item.name])),
          ),
      });
    this.reload();
  }

  selectTab(tab: string): void {
    const selected = tab as CaseTab;
    this.selectedTab.set(selected);
    if (selected === "activities") this.loadActivities();
    if (selected === "responsibilities") this.loadResponsibilities();
    if (selected === "assistant") this.loadAssistantLinks();
  }

  displayValue(value: string | null | undefined): string {
    return value?.trim() || this.local.translate("common.notProvided");
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return this.local.translate("common.notProvided");
    return new Intl.DateTimeFormat(this.local.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return this.local.translate("common.notProvided");
    return new Intl.DateTimeFormat(this.local.locale(), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  activityTypeLabel(type: ActivityType): string {
    return this.activityTypeItemToString(type);
  }

  documentCategoryLabel(document: DocumentSummary): string {
    return (
      labelOf(DOCUMENT_CATEGORY_LABELS, document.category, (key) =>
        this.local.translate(key),
      ) || this.local.translate("common.notProvided")
    );
  }

  statusBadgeClass(status: string): string {
    return sharedStatusBadgeClass(status);
  }

  priorityBadgeClass(priority: string): string {
    return sharedPriorityBadgeClass(priority);
  }

  reload(): void {
    this.loading.set(true);
    this.api
      .get(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          this.item.set(item);
          this.loading.set(false);
          this.loadActivities();
          this.loadResponsibilities();
          this.loadDocuments();
          this.loadAssistantLinks();
        },
        error: () => {
          this.loading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
  }

  loadAssistantLinks(): void {
    const workspaceId = this.auth.session()?.memberships[0]?.workspaceId;
    if (!workspaceId) return;

    const sequence = ++this.assistantRequest;
    this.assistantLoading.set(true);
    this.chat
      .caseLinks(workspaceId, this.id, {
        page: this.assistantSessions.page(),
        draftPage: this.assistantDrafts.page(),
        pageSize: this.assistantSessions.pageSize(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          if (sequence !== this.assistantRequest) return;
          const sessionsClamped = this.assistantSessions.applyPage(
            links.sessions.meta.page,
            links.sessions.meta,
          );
          const draftsClamped = this.assistantDrafts.applyPage(
            links.drafts.meta.page,
            links.drafts.meta,
          );
          if (sessionsClamped !== null || draftsClamped !== null) {
            this.loadAssistantLinks();
            return;
          }
          this.assistantLinks.set(links);
          this.assistantLoading.set(false);
        },
        error: () => {
          if (sequence !== this.assistantRequest) return;
          this.assistantLoading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
  }

  loadActivities(force = false): void {
    if (!this.activityList.loaded() || force) this.activityList.load();
  }

  loadResponsibilities(force = false): void {
    if (!this.responsibilityList.loaded() || force)
      this.responsibilityList.load();
  }

  loadDocuments(force = false): void {
    if (this.documentsLoaded() && !force) return;
    this.documentsLoading.set(true);
    this.documentsApi
      .list({ ...FIRST_PAGE, caseId: this.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.documents.set(response.items);
          this.documentsTotal.set(response.meta.totalItems);
          this.documentsLoaded.set(true);
          this.documentsLoading.set(false);
        },
        error: () => {
          this.documentsLoading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
  }

  setActivityTypes(types: ActivityType[]): void {
    this.activityTypes.set(types);
    this.activityList.reset();
  }

  /** Sessions and drafts share one request and one page size. */
  private changeAssistantPage(changed: PageState, other: PageState): void {
    if (other.pageSize() !== changed.pageSize()) {
      other.pageSize.set(changed.pageSize());
      other.page.set(1);
    }
    this.loadAssistantLinks();
  }

  lifecycle(
    action: "activate" | "putOnHold" | "resume" | "reopen" | "archive",
  ): void {
    const call = this.api[action](this.id);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(this.local.translate("cases.saved"));
        this.reload();
      },
      error: () => this.toast.error(this.local.translate("cases.saveError")),
    });
  }

  archive(): void {
    this.confirm
      .confirm({
        title: this.local.translate("cases.archive"),
        message: this.local.translate("cases.archiveConfirm"),
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ok) => {
        if (ok) this.lifecycle("archive");
      });
  }

  close(): void {
    if (this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();
      return;
    }

    const value = this.closeForm.getRawValue();
    this.api
      .close(this.id, {
        closedDate: value.closedDate,
        closingNote: value.closingNote ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showCloseForm.set(false);
          this.closeForm.reset({
            closedDate: "",
            closingNote: "",
          });
          this.toast.success(this.local.translate("cases.saved"));
          this.reload();
          this.loadActivities(true);
        },
        error: () => this.toast.error(this.local.translate("cases.saveError")),
      });
  }

  setActivityMinutes(minutes: number): void {
    this.activityForm.controls.durationMinutes.setValue(minutes);
  }

  addActivity(): void {
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const { durationMinutes, ...value } = this.activityForm.getRawValue();
    this.api
      .createActivity(this.id, {
        ...value,
        description: value.description ?? undefined,
        ...(this.activityTakesDuration() && durationMinutes
          ? { durationMinutes }
          : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showActivityForm.set(false);
          this.activityForm.reset({
            type: ActivityType.NOTE,
            title: "",
            description: "",
            activityDate: "",
            durationMinutes: null,
          });
          this.toast.success(this.local.translate("cases.saved"));
          this.activityList.reset();
        },
        error: () => this.toast.error(this.local.translate("cases.saveError")),
      });
  }

  addResponsibility(): void {
    if (this.responsibilityForm.invalid) {
      this.responsibilityForm.markAllAsTouched();
      return;
    }

    const value = this.responsibilityForm.getRawValue();
    this.api
      .addResponsibility(this.id, {
        userId: value.userId,
        isPrimary: value.isPrimary,
        startedAt: value.startedAt ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.responsibilityForm.reset({
            userId: "",
            startedAt: "",
            isPrimary: false,
          });
          this.toast.success(this.local.translate("cases.saved"));
          this.responsibilityList.reset();
          this.reload();
        },
        error: () => this.toast.error(this.local.translate("cases.saveError")),
      });
  }

  setPrimary(responsibilityId: string): void {
    this.api
      .setPrimary(this.id, responsibilityId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.local.translate("cases.saved"));
          this.loadResponsibilities(true);
          this.reload();
        },
        error: () => this.toast.error(this.local.translate("cases.saveError")),
      });
  }

  end(responsibilityId: string): void {
    this.confirm
      .confirm({
        title: this.local.translate("cases.end"),
        message: this.local.translate("cases.endConfirm"),
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ok) => {
        if (!ok) return;
        this.api
          .endResponsibility(this.id, responsibilityId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success(this.local.translate("cases.saved"));
              this.loadResponsibilities(true);
              this.reload();
            },
            error: () =>
              this.toast.error(this.local.translate("cases.saveError")),
          });
      });
  }

  userName(userId: string | null | undefined): string {
    if (!userId) return this.local.translate("common.notProvided");
    return this.users().get(userId) ?? userId;
  }

  tagName(tagId: string): string {
    const caseTags = this.item()?.tags ?? [];
    const fromCase = caseTags.find((tag) => tag.id === tagId)?.name;
    if (fromCase) return fromCase;

    const fromReference = this.tags().get(tagId);
    if (fromReference) return fromReference;

    return tagId;
  }
}
