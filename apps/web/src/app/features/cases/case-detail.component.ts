import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { KeyValuePipe } from "@angular/common";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CaseDetail } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import {
  CaseResponsibility,
  CasesApiClient,
  ChatApiClient,
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
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { DocumentUploadDialogService } from "../documents/document-upload-modal/document-upload-dialog.service";
import { WorkViewComponent } from "../work-management/work-view/work-view.component";

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
  private readonly chat = inject(ChatApiClient);
  private readonly auth = inject(AuthState);
  private readonly refs = inject(ReferencesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly uploadDialog = inject(DocumentUploadDialogService);
  private readonly destroyRef = inject(DestroyRef);
  readonly id = this.route.snapshot.paramMap.get("caseId")!;
  readonly item = signal<CaseDetail | null>(null);
  readonly loading = signal(true);
  readonly activities = signal<DomainActivity[]>([]);
  readonly responsibilities = signal<CaseResponsibility[]>([]);
  readonly users = signal(new Map<string, string>());
  readonly showCloseForm = signal(false);
  readonly assistantLinks = signal<{
    sessions: Array<{ id: string; title: string | null; updatedAt: string }>;
    drafts: Array<{ id: string; sessionId: string; approvalStatus: string }>;
  } | null>(null);
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
  readonly closeForm = new FormGroup({
    closedDate: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    closingNote: new FormControl(""),
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
    this.reload();
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
      .subscribe();
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
    this.chat
      .caseLinks(workspaceId, this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (links) => this.assistantLinks.set(links) });
  }
  load(tab: string): void {
    if (tab === "activities")
      this.api
        .listActivities(this.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (items) => this.activities.set(items) });
    if (tab === "responsibilities")
      this.api
        .listResponsibilities(this.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (items) => this.responsibilities.set(items) });
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
          this.toast.success(this.local.translate("cases.saved"));
          this.reload();
          this.load("activities");
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
          this.activityForm.reset({
            type: "NOTE",
            title: "",
            description: "",
            activityDate: "",
          });
          this.load("activities");
        },
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
        ...value,
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
          this.load("responsibilities");
          this.reload();
        },
      });
  }
  setPrimary(responsibilityId: string): void {
    this.api
      .setPrimary(this.id, responsibilityId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.load("responsibilities");
          this.reload();
        },
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
        if (ok)
          this.api
            .endResponsibility(this.id, responsibilityId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: () => this.load("responsibilities") });
      });
  }
}
