import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
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
  CasesApiClient,
  ChatApiClient,
  DocumentsApiClient,
  DomainActivity,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
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
import { DocumentUploadDialogService } from "../documents/document-upload-modal/document-upload-dialog.service";
import { WorkViewComponent } from "../work-management/work-view/work-view.component";

type CaseTab =
  | "overview"
  | "activities"
  | "work"
  | "documents"
  | "notes"
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
  ],
})
export class CaseDetailComponent {
  private readonly api = inject(CasesApiClient);
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly chat = inject(ChatApiClient);
  private readonly auth = inject(AuthState);
  private readonly refs = inject(ReferencesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly uploadDialog = inject(DocumentUploadDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = this.route.snapshot.paramMap.get("caseId") ?? "";
  readonly item = signal<CaseDetail | null>(null);
  readonly loading = signal(true);
  readonly selectedTab = signal<CaseTab>("overview");
  readonly activities = signal<DomainActivity[]>([]);
  readonly activitiesLoading = signal(false);
  readonly activitiesLoaded = signal(false);
  readonly responsibilities = signal<CaseResponsibility[]>([]);
  readonly responsibilitiesLoading = signal(false);
  readonly responsibilitiesLoaded = signal(false);
  readonly documents = signal<DocumentSummary[]>([]);
  readonly documentsLoading = signal(false);
  readonly documentsLoaded = signal(false);
  readonly users = signal(new Map<string, string>());
  readonly tags = signal(new Map<string, string>());
  readonly caseTypes = signal(new Map<string, string>());
  readonly practiceAreas = signal(new Map<string, string>());
  readonly showCloseForm = signal(false);
  readonly showActivityForm = signal(false);
  readonly assistantLinks = signal<{
    sessions: Array<{ id: string; title: string | null; updatedAt: string }>;
    drafts: Array<{ id: string; sessionId: string; approvalStatus: string }>;
  } | null>(null);
  readonly assistantLoading = signal(false);

  readonly activityTypeOptions: ReadonlyArray<DomainActivity["type"]> = [
    "NOTE",
    "PHONE_CALL",
    "MEETING",
    "EMAIL",
    "OTHER",
  ];
  readonly activityTypeItemToString = (
    value: DomainActivity["type"] | string | null | undefined,
  ): string => value ?? "";
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
  readonly noteActivities = computed(() =>
    this.activities().filter((activity) => activity.type === "NOTE"),
  );
  readonly activeResponsibilities = computed(() =>
    this.responsibilities().filter((responsibility) => !responsibility.endedAt),
  );
  readonly primaryResponsibility = computed(
    () =>
      this.responsibilities().find(
        (responsibility) => responsibility.isPrimary,
      ) ?? null,
  );
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
    if (selected === "notes") this.loadActivities();
    if (selected === "assistant") this.loadAssistantLinks();
    if (selected === "documents") this.loadDocuments();
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
    switch (status) {
      case "DRAFT":
        return "border-border bg-muted text-foreground";
      case "ACTIVE":
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
      case "ON_HOLD":
        return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
      case "CLOSED":
        return "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300";
      case "ARCHIVED":
        return "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
      default:
        return "border-border bg-muted text-foreground";
    }
  }

  priorityBadgeClass(priority: string): string {
    switch (priority) {
      case "LOW":
        return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
      case "NORMAL":
        return "border-border bg-muted text-foreground";
      case "HIGH":
        return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
      case "URGENT":
        return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
      default:
        return "border-border bg-muted text-foreground";
    }
  }

  openDocumentsUpload(): void {
    const item = this.item();
    if (!item) return;
    this.uploadDialog
      .open({
        caseId: item.id,
        caseLabel: `${item.caseNumber} ${item.name}`.trim(),
        lockCase: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadDocuments(true);
      });
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

  private loadAssistantLinks(): void {
    const workspaceId = this.auth.session()?.memberships[0]?.workspaceId;
    if (!workspaceId) return;

    this.assistantLoading.set(true);
    this.chat
      .caseLinks(workspaceId, this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          this.assistantLinks.set(links);
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
      .listActivities(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.activities.set(items);
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
      .listResponsibilities(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.responsibilities.set(items);
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
      .list({ caseId: this.id, page: 1, pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.documents.set(response.items);
          this.documentsLoaded.set(true);
          this.documentsLoading.set(false);
        },
        error: () => {
          this.documentsLoading.set(false);
          this.toast.error(this.local.translate("cases.loadError"));
        },
      });
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

  addActivity(): void {
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const value = this.activityForm.getRawValue();
    this.api
      .createActivity(this.id, {
        ...value,
        description: value.description ?? undefined,
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
          });
          this.toast.success(this.local.translate("cases.saved"));
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
