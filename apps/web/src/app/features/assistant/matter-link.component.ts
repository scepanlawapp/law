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
import {
  BriefApplyPreview,
  BriefTaskPreview,
  ChatSessionSummary,
} from "@law/api-interfaces";
import { ChatApiClient, CasesApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-assistant-matter-link",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSpinner,
    TranslatePipe,
  ],
  template: `
    <section
      class="border-border bg-card text-card-foreground rounded-lg border p-4 text-sm"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-base font-medium">
          {{ "assistant.matter.linkTitle" | translate }}
        </h2>
        @if (loading()) {
          <hlm-spinner />
        }
      </div>
      @if (session()?.case) {
        <p>{{ session()!.case!.caseNumber }} — {{ session()!.case!.name }}</p>
        <a
          class="text-primary underline"
          [routerLink]="['/cases', session()!.case!.id]"
        >
          {{ "assistant.matter.openCase" | translate }}
        </a>
      } @else {
        <label class="mb-2 block" for="matter-case-search">
          {{ "assistant.matter.searchCase" | translate }}
        </label>
        <input
          hlmInput
          id="matter-case-search"
          [value]="search()"
          (input)="onSearch($event)"
        />
        <ul class="mt-2 space-y-1">
          @for (item of caseOptions(); track item.id) {
            <li>
              <button
                hlmBtn
                variant="outline"
                type="button"
                (click)="chooseCase(item.id)"
              >
                {{ item.caseNumber }} — {{ item.name }}
              </button>
            </li>
          }
        </ul>
      }

      @if (preview(); as card) {
        <form
          class="mt-4 space-y-3"
          [formGroup]="form"
          (ngSubmit)="confirmCase()"
        >
          <h3 class="font-medium">
            {{ "assistant.matter.confirmCase" | translate }}
          </h3>
          @if (card.alreadyApplied && card.appliedCaseId) {
            <a
              class="text-primary underline"
              [routerLink]="['/cases', card.appliedCaseId]"
            >
              {{ "assistant.matter.alreadyFiled" | translate }}
            </a>
          } @else {
            <p>{{ card.plaintiffName }}</p>
            @for (match of card.clientMatches; track match.id) {
              <label class="flex gap-2">
                <input
                  type="radio"
                  name="client-mode"
                  [checked]="selectedClientId() === match.id"
                  (change)="selectExisting(match.id)"
                />
                {{ match.displayName }} ({{ match.clientNumber }})
              </label>
            }
            <label class="flex gap-2">
              <input
                type="radio"
                name="client-mode"
                [checked]="createClient()"
                (change)="selectCreate()"
              />
              {{ "assistant.matter.createClient" | translate }}
            </label>
            @if (createClient()) {
              <input
                hlmInput
                formControlName="firstName"
                [placeholder]="'assistant.matter.firstName' | translate"
              />
              <input
                hlmInput
                formControlName="lastName"
                [placeholder]="'assistant.matter.lastName' | translate"
              />
              @if (card.nameNeedsSplit) {
                <p>{{ "assistant.matter.nameNeedsSplit" | translate }}</p>
              }
            }
            <p>
              {{ "assistant.matter.opposing" | translate }}:
              {{ card.defendantName }}
            </p>
            <input hlmInput formControlName="caseNumber" />
            <input hlmInput formControlName="name" />
            <textarea
              class="border-input bg-background w-full rounded-md border p-2"
              formControlName="description"
            ></textarea>
            @if (card.missingFields.length) {
              <p>
                {{ "assistant.missingFields" | translate }}:
                {{ card.missingFields.join(", ") }}
              </p>
            }
            <button hlmBtn type="submit" [disabled]="saving()">
              {{ "assistant.matter.confirmCase" | translate }}
            </button>
          }
        </form>
      }

      @if (taskPreview(); as tasks) {
        <form class="mt-4 space-y-2" (ngSubmit)="confirmTasks()">
          <h3 class="font-medium">
            {{ "assistant.matter.confirmTasks" | translate }}
          </h3>
          @for (task of tasks.proposals; track task.key) {
            <label class="flex gap-2">
              <input
                type="checkbox"
                [checked]="selectedTaskKeys().has(task.key)"
                [disabled]="task.alreadyApplied"
                (change)="toggleTask(task.key)"
              />
              <span>{{ task.title }}</span>
            </label>
          }
          <button
            hlmBtn
            type="submit"
            [disabled]="saving() || !selectedTaskKeys().size"
          >
            {{ "assistant.matter.confirmTasks" | translate }}
          </button>
          <a
            class="text-primary ml-3 underline"
            [routerLink]="['/cases', tasks.caseId]"
          >
            {{ "assistant.matter.openWork" | translate }}
          </a>
        </form>
      }
      @if (error()) {
        <p class="text-destructive mt-2">{{ error() }}</p>
      }
    </section>
  `,
})
export class AssistantMatterLinkComponent {
  private readonly chat = inject(ChatApiClient);
  private readonly cases = inject(CasesApiClient);

  readonly workspaceId = input.required<string>();
  readonly session = input<ChatSessionSummary | null>(null);
  readonly briefId = input<string | null>(null);
  readonly linked = output<ChatSessionSummary>();

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
