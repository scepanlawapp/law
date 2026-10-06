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
import { CaseDetail, DocumentSummary } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import {
  CaseResponsibility,
  CaseLinksResponse,
  CasesApiClient,
  ChatApiClient,
  DocumentsApiClient,
  DomainActivity,
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

const CASE_DETAIL_PAGE_SIZE = 10;

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
  readonly activities = signal<DomainActivity[]>([]);
  readonly activitiesLoading = signal(false);
  readonly activitiesLoaded = signal(false);
  readonly activitiesPage = signal(1);
  readonly activitiesPageCount = signal(1);
  readonly activitiesTotal = signal(0);
  readonly activityTypes = signal<DomainActivity["type"][]>([]);
  readonly activitySearch = new FormControl("", { nonNullable: true });
  readonly responsibilities = signal<CaseResponsibility[]>([]);
  readonly responsibilitiesLoading = signal(false);
  readonly responsibilitiesLoaded = signal(false);
  readonly responsibilitiesPage = signal(1);
  readonly responsibilitiesPageCount = signal(1);
  readonly responsibilitiesTotal = signal(0);
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
  readonly assistantLoading = signal(false);
  readonly assistantSessionsPage = signal(1);
  readonly assistantSessionsPageCount = signal(1);
  readonly assistantDraftsPage = signal(1);
  readonly assistantDraftsPageCount = signal(1);

  readonly activityTypeOptions: ReadonlyArray<DomainActivity["type"]> = [
    "NOTE",
    "PHONE_CALL",
    "MEETING",
    "EMAIL",
    "OTHER",
  ];
  readonly activityTypeItemToString = (
    value: DomainActivity["type"] | string | null | undefined,
  ): string =>
    value
      ? this.local.translate(
          `cases.activity.type.${value as DomainActivity["type"]}`,
        )
      : "";
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
    type: new FormControl<DomainActivity["type"]>("NOTE", {
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
    ["PHONE_CALL", "MEETING", "EMAIL"].includes(this.selectedActivityType()),
  );
  private readonly syncActivityDuration =
    this.activityForm.controls.type.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((type) => {
        const control = this.activityForm.controls.durationMinutes;
        if (["PHONE_CALL", "MEETING", "EMAIL"].includes(type)) {
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
      .subscribe(() => {
        this.activitiesPage.set(1);
        this.loadActivities(true);
      });
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
    return new Intl.DateTimeFormat(
      this.local.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return this.local.translate("common.notProvided");
    return new Intl.DateTimeFormat(
      this.local.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium", timeStyle: "short" },
    ).format(new Date(value));
  }

  activityTypeLabel(type: DomainActivity["type"]): string {
    return this.local.translate(`cases.activity.type.${type}`);
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

    this.assistantLoading.set(true);
    this.chat
      .caseLinks(workspaceId, this.id, {
        page: this.assistantSessionsPage(),
        draftPage: this.assistantDraftsPage(),
        pageSize: CASE_DETAIL_PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          this.assistantLinks.set(links);
          this.assistantSessionsPage.set(links.sessions.meta.page);
          this.assistantSessionsPageCount.set(
            Math.max(1, links.sessions.meta.totalPages),
          );
          this.assistantDraftsPage.set(links.drafts.meta.page);
          this.assistantDraftsPageCount.set(
            Math.max(1, links.drafts.meta.totalPages),
          );
          this.assistantLoading.set(false);
        },
        error: () => {
          this.assistantLoading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
  }

  loadActivities(force = false): void {
    if (this.activitiesLoaded() && !force) return;
    this.activitiesLoading.set(true);
    this.api
      .listActivities(this.id, {
        search: this.activitySearch.value.trim() || undefined,
        types: this.activityTypes().length ? this.activityTypes() : undefined,
        page: this.activitiesPage(),
        pageSize: CASE_DETAIL_PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.activities.set(response.items);
          this.activitiesPage.set(response.meta.page);
          this.activitiesPageCount.set(Math.max(1, response.meta.totalPages));
          this.activitiesTotal.set(response.meta.totalItems);
          this.activitiesLoaded.set(true);
          this.activitiesLoading.set(false);
        },
        error: () => {
          this.activitiesLoading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
  }

  loadResponsibilities(force = false): void {
    if (this.responsibilitiesLoaded() && !force) return;
    this.responsibilitiesLoading.set(true);
    this.api
      .listResponsibilities(this.id, {
        page: this.responsibilitiesPage(),
        pageSize: CASE_DETAIL_PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.responsibilities.set(response.items);
          this.responsibilitiesPage.set(response.meta.page);
          this.responsibilitiesPageCount.set(
            Math.max(1, response.meta.totalPages),
          );
          this.responsibilitiesTotal.set(response.meta.totalItems);
          this.responsibilitiesLoaded.set(true);
          this.responsibilitiesLoading.set(false);
        },
        error: () => {
          this.responsibilitiesLoading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
  }

  loadDocuments(force = false): void {
    if (this.documentsLoaded() && !force) return;
    this.documentsLoading.set(true);
    this.documentsApi
      .list({
        caseId: this.id,
        page: 1,
        pageSize: CASE_DETAIL_PAGE_SIZE,
      })
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

  setActivityTypes(types: DomainActivity["type"][]): void {
    this.activityTypes.set(types);
    this.activitiesPage.set(1);
    this.loadActivities(true);
  }

  changeActivitiesPage(page: number): void {
    if (page < 1 || page > this.activitiesPageCount()) return;
    this.activitiesPage.set(page);
    this.loadActivities(true);
  }

  changeResponsibilitiesPage(page: number): void {
    if (page < 1 || page > this.responsibilitiesPageCount()) return;
    this.responsibilitiesPage.set(page);
    this.loadResponsibilities(true);
  }

  changeAssistantSessionsPage(page: number): void {
    if (page < 1 || page > this.assistantSessionsPageCount()) return;
    this.assistantSessionsPage.set(page);
    this.loadAssistantLinks();
  }

  changeAssistantDraftsPage(page: number): void {
    if (page < 1 || page > this.assistantDraftsPageCount()) return;
    this.assistantDraftsPage.set(page);
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
            type: "NOTE",
            title: "",
            description: "",
            activityDate: "",
            durationMinutes: null,
          });
          this.toast.success(this.local.translate("cases.saved"));
          this.activitiesPage.set(1);
          this.loadActivities(true);
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
          this.responsibilitiesPage.set(1);
          this.loadResponsibilities(true);
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
