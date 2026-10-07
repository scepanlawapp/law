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
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideBriefcase,
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleCheck,
} from "@ng-icons/lucide";
import {
  BriefApplyPreview,
  BriefMissingField,
  BriefPartyOption,
  BriefTaskPreview,
  BriefTaskProposal,
  ChatSessionSummary,
} from "@law/api-interfaces";
import { ChatApiClient, CasesApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmRadioGroupImports } from "@spartan-ng/helm/radio-group";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { briefFieldLabel } from "./brief-field-label";

type TaskGroupSource = BriefTaskProposal["source"];

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
    HlmLabel,
    HlmRadioGroupImports,
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
      lucideCircleCheck,
    }),
  ],
})
export class AssistantMatterLinkComponent {
  private readonly chat = inject(ChatApiClient);
  private readonly cases = inject(CasesApiClient);
  private readonly localization = inject(LocalizationService);

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
  readonly taskDueDates = signal<Readonly<Record<string, string>>>({});
  readonly taskGroups = computed(() => {
    const proposals = this.taskPreview()?.proposals ?? [];
    return (["missing", "evidence"] as const)
      .map((source) => ({
        source,
        titleKey:
          source === "missing"
            ? "assistant.matter.missingData"
            : "assistant.matter.evidenceGroup",
        tasks: proposals.filter((task) => task.source === source),
      }))
      .filter((group) => group.tasks.length);
  });
  readonly canConfirm = computed(() => !this.saving());
  readonly documentTypeLabel = computed(() => {
    const type = this.preview()?.documentType;
    return type ? `assistant.documentType.${type}` : null;
  });
  // Which brief party is the office's client; changing it reloads the preview.
  readonly clientRole = new FormControl<string | null>(null);
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
    this.clientRole.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((role) => {
        if (role && role !== this.preview()?.clientRole) this.loadBrief(role);
      });
  }

  loadBrief(clientRole?: string): void {
    const workspaceId = this.workspaceId();
    const session = this.session();
    const briefId = this.briefId();
    if (!workspaceId || !session || !briefId) return;
    this.loading.set(true);
    this.chat
      .previewBrief(
        workspaceId,
        session.id,
        briefId,
        clientRole ? { clientRole } : {},
      )
      .subscribe({
        next: (preview) => {
          this.preview.set(preview);
          this.clientRole.setValue(preview.clientRole, { emitEvent: false });
          this.form.patchValue({
            firstName: preview.suggestedFirstName ?? "",
            lastName: preview.suggestedLastName ?? "",
            caseNumber: preview.suggestedCaseNumber,
            name: preview.suggestedCaseName,
            description: preview.suggestedDescription,
            opposingPartyName: preview.opposingPartyName ?? "",
            opposingPartyAddress: preview.opposingPartyAddress ?? "",
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

  // Known roles are translated; a role the UI does not know keeps the server label.
  partyRoleLabel(party: BriefPartyOption): string {
    const key = `assistant.partyRole.${party.role}`;
    const translated = this.localization.translate(key);
    return translated === key ? party.label : translated;
  }

  fieldLabel(field: BriefMissingField): string {
    return briefFieldLabel(field, (key) => this.localization.translate(key));
  }

  missingFieldLabels(fields: BriefMissingField[]): string {
    return fields.map((field) => this.fieldLabel(field)).join(", ");
  }

  dueDateOf(task: BriefTaskProposal): string {
    return this.taskDueDates()[task.key] ?? task.dueDate;
  }

  setDueDate(key: string, value: string): void {
    this.taskDueDates.update((dates) => ({ ...dates, [key]: value }));
  }

  groupAllSelected(source: TaskGroupSource): boolean {
    const open = this.openTasks(source);
    const selected = this.selectedTaskKeys();
    return open.length > 0 && open.every((task) => selected.has(task.key));
  }

  toggleGroup(source: TaskGroupSource): void {
    const selectAll = !this.groupAllSelected(source);
    const next = new Set(this.selectedTaskKeys());
    for (const task of this.openTasks(source)) {
      if (selectAll) next.add(task.key);
      else next.delete(task.key);
    }
    this.selectedTaskKeys.set(next);
  }

  private openTasks(source: TaskGroupSource): BriefTaskProposal[] {
    return (this.taskPreview()?.proposals ?? []).filter(
      (task) => task.source === source && !task.alreadyApplied,
    );
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
        tasks: [...this.selectedTaskKeys()].map((key) => {
          const dueDate = this.taskDueDates()[key];
          return dueDate ? { key, dueDate } : { key };
        }),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
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
      next: (preview) => {
        this.taskPreview.set(preview);
        this.taskDueDates.set({});
        this.selectedTaskKeys.set(
          new Set(
            preview.proposals
              .filter((task) => task.selectedByDefault && !task.alreadyApplied)
              .map((task) => task.key),
          ),
        );
      },
      error: () => this.error.set("assistant.matter.taskError"),
    });
  }
}
