import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideBriefcase,
  lucideChevronLeft,
  lucideChevronRight,
} from "@ng-icons/lucide";
import {
  BriefApplyPreview,
  BriefTaskPreview,
  ChatSessionSummary,
} from "@law/api-interfaces";
import { ChatApiClient, CasesApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-assistant-matter-link",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTooltipImports,
    TranslatePipe,
  ],
  templateUrl: "./matter-link.component.html",
  styleUrl: "./matter-link.component.scss",
  providers: [
    provideIcons({
      lucideBriefcase,
      lucideChevronLeft,
      lucideChevronRight,
    }),
  ],
})
export class AssistantMatterLinkComponent {
  private readonly chat = inject(ChatApiClient);
  private readonly cases = inject(CasesApiClient);

  readonly workspaceId = input.required<string>();
  readonly session = input<ChatSessionSummary | null>(null);
  readonly briefId = input<string | null>(null);
  readonly expanded = input(true);
  readonly linked = output<ChatSessionSummary>();
  readonly expandedChange = output<boolean>();

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly search = signal("");
  readonly caseOptions = signal<
    Array<{ id: string; caseNumber: string; name: string }>
  >([]);
  readonly preview = signal<BriefApplyPreview | null>(null);
  readonly taskPreview = signal<BriefTaskPreview | null>(null);
  readonly createClient = signal(false);
  readonly selectedClientId = signal<string | null>(null);
  readonly selectedTaskKeys = signal<ReadonlySet<string>>(new Set());
  readonly canConfirm = computed(() => !this.saving());
  private loadedKey: string | null = null;
  readonly form = new FormGroup({
    firstName: new FormControl(""),
    lastName: new FormControl(""),
    caseNumber: new FormControl(""),
    name: new FormControl(""),
    description: new FormControl(""),
    opposingPartyName: new FormControl(""),
    opposingPartyAddress: new FormControl(""),
  });

  constructor() {
    effect(() => {
      const briefId = this.briefId();
      const sessionId = this.session()?.id ?? null;
      const key = briefId && sessionId ? `${sessionId}:${briefId}` : null;
      if (!key || key === this.loadedKey) return;
      this.loadedKey = key;
      this.loadBrief();
    });
  }

  loadBrief(): void {
    const workspaceId = this.workspaceId();
    const session = this.session();
    const briefId = this.briefId();
    if (!workspaceId || !session || !briefId) return;
    this.loading.set(true);
    this.chat.previewBrief(workspaceId, session.id, briefId).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.form.patchValue({
          firstName: preview.suggestedFirstName ?? "",
          lastName: preview.suggestedLastName ?? "",
          caseNumber: preview.suggestedCaseNumber,
          name: preview.suggestedCaseName,
          description: preview.suggestedDescription,
          opposingPartyName: preview.defendantName ?? "",
          opposingPartyAddress: preview.defendantAddress ?? "",
        });
        this.createClient.set(!preview.clientMatches.length);
        this.selectedClientId.set(preview.clientMatches[0]?.id ?? null);
        this.loading.set(false);
        if (preview.alreadyApplied) this.loadTasks();
      },
      error: () => {
        this.loading.set(false);
        this.error.set("assistant.matter.previewError");
      },
    });
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search.set(value);
    if (value.trim().length < 2) {
      this.caseOptions.set([]);
      return;
    }
    this.cases.list({ search: value.trim(), page: 1, pageSize: 5 }).subscribe({
      next: (response) => this.caseOptions.set(response.items),
      error: () => this.error.set("assistant.matter.previewError"),
    });
  }

  chooseCase(caseId: string): void {
    const workspaceId = this.workspaceId();
    const session = this.session();
    if (!workspaceId || !session) return;
    this.saving.set(true);
    this.chat.linkSessionCase(workspaceId, session.id, caseId).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.linked.emit(updated);
      },
      error: () => {
        this.saving.set(false);
        this.error.set("assistant.matter.linkError");
      },
    });
  }

  selectExisting(clientId: string): void {
    this.createClient.set(false);
    this.selectedClientId.set(clientId);
  }

  selectCreate(): void {
    this.createClient.set(true);
    this.selectedClientId.set(null);
  }

  toggleTask(key: string): void {
    const next = new Set(this.selectedTaskKeys());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedTaskKeys.set(next);
  }

  confirmCase(): void {
    const workspaceId = this.workspaceId();
    const session = this.session();
    const briefId = this.briefId();
    const raw = this.form.getRawValue();
    if (!workspaceId || !session || !briefId || !raw.caseNumber || !raw.name)
      return;
    this.saving.set(true);
    this.chat
      .applyBrief(workspaceId, session.id, briefId, {
        client: this.createClient()
          ? {
              mode: "create",
              firstName: raw.firstName ?? "",
              lastName: raw.lastName ?? "",
            }
          : {
              mode: "existing",
              clientId: this.selectedClientId() ?? undefined,
            },
        caseNumber: raw.caseNumber,
        name: raw.name,
        description: raw.description ?? "",
        responsibleUserId: this.preview()?.responsibleUserId ?? "",
        opposingPartyName: raw.opposingPartyName,
        opposingPartyAddress: raw.opposingPartyAddress,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.loadTasks();
        },
        error: () => {
          this.saving.set(false);
          this.error.set("assistant.matter.applyError");
        },
      });
  }

  confirmTasks(): void {
    const workspaceId = this.workspaceId();
    const session = this.session();
    const briefId = this.briefId();
    if (!workspaceId || !session || !briefId) return;
    this.saving.set(true);
    this.chat
      .applyBriefTasks(workspaceId, session.id, briefId, {
        tasks: [...this.selectedTaskKeys()].map((key) => ({ key })),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.selectedTaskKeys.set(new Set());
          this.loadTasks();
        },
        error: () => {
          this.saving.set(false);
          this.error.set("assistant.matter.taskError");
        },
      });
  }

  private loadTasks(): void {
    const workspaceId = this.workspaceId();
    const session = this.session();
    const briefId = this.briefId();
    if (!workspaceId || !session || !briefId) return;
    this.chat.previewBriefTasks(workspaceId, session.id, briefId).subscribe({
      next: (preview) => this.taskPreview.set(preview),
      error: () => this.error.set("assistant.matter.taskError"),
    });
  }
}