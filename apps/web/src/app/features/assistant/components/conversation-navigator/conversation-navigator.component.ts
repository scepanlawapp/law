import { DatePipe, NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {
  ChatSessionFacetsResponse,
  ChatSessionStateFilter,
  ChatSessionSummary,
} from "@law/api-interfaces";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideArchive,
  lucideArchiveRestore,
  lucideBot,
  lucideCalendarDays,
  lucideEllipsis,
  lucideFileText,
  lucideFolderOpen,
  lucideLoaderCircle,
  lucideMessageCircle,
  lucidePencil,
  lucidePin,
  lucidePinOff,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
  lucideX,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmComboboxImports } from "@spartan-ng/helm/combobox";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { LocalizationService } from "../../../../core/localization/localization.service";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import { BottomReachedDirective } from "../../../../core/directives/bottom-reached.directive";
import {
  ANALYSIS_TOKEN_KINDS,
  ConversationFilters,
  ConversationGroupMode,
  ConversationToken,
  ConversationTokenKind,
  groupConversations,
  hasActiveFilters,
  parseTokenKey,
  tokenKey,
} from "./conversation-filters";

export interface ConversationRename {
  session: ChatSessionSummary;
  title: string;
}

interface Suggestion {
  key: string;
  label: string;
  detail: string | null;
}

interface SuggestionSection {
  kind: ConversationTokenKind;
  labelKey: string;
  items: Suggestion[];
}

const STATE_CHIPS: { value: ChatSessionStateFilter; labelKey: string }[] = [
  { value: "pending", labelKey: "assistant.organizer.pending" },
  { value: "draft", labelKey: "assistant.organizer.drafts" },
  { value: "analysis", labelKey: "assistant.organizer.analyses" },
];

const TOKEN_KIND_LABELS: Record<ConversationTokenKind, string> = {
  client: "assistant.organizer.tokenClient",
  case: "assistant.organizer.tokenCase",
  author: "assistant.organizer.tokenAuthor",
  kind: "assistant.organizer.tokenKind",
};

const ANALYSIS_KIND_LABELS: Record<string, string> = {
  CONTRACT_REVIEW: "assistant.organizer.kindContractReview",
  CASE_TIMELINE: "assistant.organizer.kindCaseTimeline",
};

/**
 * Assistant sidebar: token search, filter chips, date/matter grouping, pinned
 * section and per-conversation actions. Stateless about data — the assistant
 * screen owns the list, the filters and the facets.
 */
@Component({
  selector: "law-conversation-navigator",
  imports: [
    DatePipe,
    NgTemplateOutlet,
    NgIcon,
    HlmButton,
    HlmSpinner,
    TranslatePipe,
    BottomReachedDirective,
    ...HlmComboboxImports,
    ...HlmDropdownMenuImports,
  ],
  templateUrl: "./conversation-navigator.component.html",
  styleUrl: "./conversation-navigator.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArchive,
      lucideArchiveRestore,
      lucideBot,
      lucideCalendarDays,
      lucideEllipsis,
      lucideFileText,
      lucideFolderOpen,
      lucideLoaderCircle,
      lucideMessageCircle,
      lucidePencil,
      lucidePin,
      lucidePinOff,
      lucidePlus,
      lucideSearch,
      lucideTrash2,
      lucideX,
    }),
  ],
  host: { "(document:keydown)": "onDocumentKeydown($event)" },
})
export class ConversationNavigatorComponent {
  private readonly localization = inject(LocalizationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly sessions = input.required<ChatSessionSummary[]>();
  readonly loading = input(false);
  readonly selectedSessionId = input<string | null>(null);
  readonly filters = input.required<ConversationFilters>();
  readonly groupMode = input<ConversationGroupMode>("date");
  readonly facets = input<ChatSessionFacetsResponse | null>(null);

  readonly create = output<void>();
  readonly selectSession = output<string>();
  readonly loadMore = output<void>();
  readonly filtersChange = output<ConversationFilters>();
  readonly groupModeChange = output<ConversationGroupMode>();
  readonly togglePin = output<ChatSessionSummary>();
  readonly toggleArchive = output<ChatSessionSummary>();
  readonly rename = output<ConversationRename>();
  readonly remove = output<ChatSessionSummary>();

  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>("searchInput");

  protected readonly stateChips = STATE_CHIPS;
  protected readonly renamingId = signal<string | null>(null);
  /** Token labels survive facet refreshes and paging. */
  private readonly labelCache = new Map<string, string>();

  protected readonly sections = computed(() =>
    groupConversations(this.sessions(), this.groupMode()),
  );
  protected readonly tokenKeys = computed(() =>
    this.filters().tokens.map((token) => token.key),
  );
  protected readonly filtered = computed(() =>
    hasActiveFilters(this.filters()),
  );
  protected readonly suggestionSections = computed<SuggestionSection[]>(() => {
    const facets = this.facets();
    const selected = new Set(this.tokenKeys());
    const text = this.filters().text.trim().toLocaleLowerCase();
    const sections: SuggestionSection[] = [
      {
        kind: "client",
        labelKey: TOKEN_KIND_LABELS.client,
        items: (facets?.suggestions.clients ?? []).map((client) => ({
          key: tokenKey("client", client.id),
          label: client.displayName,
          detail: null,
        })),
      },
      {
        kind: "case",
        labelKey: TOKEN_KIND_LABELS.case,
        items: (facets?.suggestions.cases ?? []).map((item) => ({
          key: tokenKey("case", item.id),
          label: item.caseNumber,
          detail: item.name,
        })),
      },
      {
        kind: "author",
        labelKey: TOKEN_KIND_LABELS.author,
        items: (facets?.suggestions.authors ?? []).map((author) => ({
          key: tokenKey("author", author.id),
          label: author.displayName,
          detail: null,
        })),
      },
      {
        kind: "kind",
        labelKey: TOKEN_KIND_LABELS.kind,
        items: ANALYSIS_TOKEN_KINDS.map((kind) => ({
          key: tokenKey("kind", kind),
          label: this.localization.translate(ANALYSIS_KIND_LABELS[kind]),
          detail: null,
        })).filter(
          (item) => !text || item.label.toLocaleLowerCase().includes(text),
        ),
      },
    ];
    for (const section of sections) {
      for (const item of section.items)
        this.labelCache.set(item.key, item.label);
      section.items = section.items.filter((item) => !selected.has(item.key));
    }
    return sections.filter((section) => section.items.length);
  });

  /** Suggestions are already matched by the API (in Latin script). */
  protected readonly keepAllSuggestions = () => true;
  protected readonly tokenToString = (key: string | null | undefined) =>
    key ? this.tokenLabel(key) : "";

  protected tokenLabel(key: string): string {
    const token = parseTokenKey(key);
    if (!token) return key;
    if (token.kind === "kind") {
      return this.localization.translate(ANALYSIS_KIND_LABELS[token.id] ?? key);
    }
    const fromSessions = this.labelFromSessions(token);
    if (fromSessions) this.labelCache.set(key, fromSessions);
    return (
      this.labelCache.get(key) ??
      this.localization.translate(TOKEN_KIND_LABELS[token.kind])
    );
  }

  protected tokenKindLabel(key: string): string {
    const token = parseTokenKey(key);
    return token
      ? this.localization.translate(TOKEN_KIND_LABELS[token.kind])
      : "";
  }

  protected onTokensChange(keys: string[] | null | undefined): void {
    const tokens = (keys ?? [])
      .map(parseTokenKey)
      .filter((token): token is ConversationToken => token !== null);
    this.emitFilters({ tokens });
  }

  protected onSearchChange(text: string): void {
    if (text === this.filters().text) return;
    this.emitFilters({ text });
  }

  protected setScope(scope: ConversationFilters["scope"]): void {
    if (scope !== this.filters().scope) this.emitFilters({ scope });
  }

  protected toggleState(state: ChatSessionStateFilter): void {
    const states = this.filters().states;
    this.emitFilters({
      states: states.includes(state)
        ? states.filter((item) => item !== state)
        : [...states, state],
    });
  }

  protected toggleArchived(): void {
    this.emitFilters({ archived: !this.filters().archived });
  }

  protected clearFilters(): void {
    this.emitFilters({ states: [], archived: false, tokens: [], text: "" });
  }

  protected stateCount(state: ChatSessionStateFilter): number | null {
    return this.facets()?.counts[state] ?? null;
  }

  protected archivedCount(): number | null {
    return this.facets()?.counts.archived ?? null;
  }

  protected setGroupMode(mode: ConversationGroupMode): void {
    if (mode !== this.groupMode()) this.groupModeChange.emit(mode);
  }

  protected startRename(session: ChatSessionSummary): void {
    this.renamingId.set(session.id);
    // Focus after the input renders.
    setTimeout(() =>
      this.host.nativeElement
        .querySelector<HTMLInputElement>(".conversation-rename")
        ?.select(),
    );
  }

  protected finishRename(session: ChatSessionSummary, title: string): void {
    if (this.renamingId() !== session.id) return;
    this.renamingId.set(null);
    const trimmed = title.trim();
    if (trimmed && trimmed !== (session.title ?? "")) {
      this.rename.emit({ session, title: trimmed });
    }
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  protected sessionHint(session: ChatSessionSummary): string | null {
    const activity = session.activity;
    if (activity?.activeJobCount) return "assistant.conversationWorking";
    if (activity?.pendingActionCount)
      return "assistant.organizer.awaitingApproval";
    if (activity?.hasDraft) return "assistant.conversationDraftReady";
    if (activity?.analysisKinds?.length) {
      return ANALYSIS_KIND_LABELS[activity.analysisKinds[0]] ?? null;
    }
    return null;
  }

  protected sessionIcon(session: ChatSessionSummary): string {
    if (session.activity?.activeJobCount) return "lucideLoaderCircle";
    if (session.activity?.hasDraft) return "lucideFileText";
    return "lucideMessageCircle";
  }

  /** `/` focuses the search unless the user is typing somewhere else. */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }
    const input = this.searchInput()?.nativeElement;
    // Only the visible navigator (desktop rail or open mobile sheet).
    if (!input || input.offsetParent === null) return;
    event.preventDefault();
    input.focus();
  }

  private emitFilters(changes: Partial<ConversationFilters>): void {
    this.filtersChange.emit({ ...this.filters(), ...changes });
  }

  private labelFromSessions(token: ConversationToken): string | null {
    for (const session of this.sessions()) {
      if (token.kind === "case" && session.case?.id === token.id) {
        return session.case.caseNumber;
      }
      if (token.kind === "client" && session.case?.clientId === token.id) {
        return session.case.clientDisplayName;
      }
      if (token.kind === "author" && session.createdBy?.id === token.id) {
        return session.createdBy.displayName;
      }
    }
    return null;
  }
}
