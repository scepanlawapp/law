import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmCommandImports } from "@spartan-ng/helm/command";
import {
  HlmDialogDescription,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import {
  StarterPick,
  StarterPickerResult,
  StarterPickKind,
} from "../../assistant-starter-prompts";
import type { StarterPickerContext } from "./starter-picker.service";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

/** Case-, script-, and diacritic-insensitive text for local filtering. */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

@Component({
  selector: "law-starter-picker-dialog",
  standalone: true,
  imports: [
    HlmButton,
    HlmCommandImports,
    HlmDialogDescription,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmSpinner,
    TranslatePipe,
  ],
  templateUrl: "./starter-picker-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarterPickerDialogComponent {
  private readonly context = injectBrnDialogContext<StarterPickerContext>();
  private readonly dialogRef = inject(BrnDialogRef<StarterPickerResult>);
  private readonly clients = inject(ClientsApiClient);
  private readonly cases = inject(CasesApiClient);
  private readonly documents = inject(DocumentsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchTerms = new Subject<string>();
  private people$?: Observable<StarterPick[]>;

  protected readonly kind: StarterPickKind = this.context.kind;
  protected readonly options = signal<StarterPick[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Results are already filtered by the server or `searchPeople`. */
  protected readonly acceptAll = () => true;

  constructor() {
    this.searchTerms
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((term) => term.trim()),
        startWith(""),
        distinctUntilChanged(),
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap((term) =>
          this.search(term).pipe(
            catchError(() => {
              this.failed.set(true);
              return of([] as StarterPick[]);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((options) => {
        this.options.set(options);
        this.loading.set(false);
      });
  }

  protected onSearch(term: string): void {
    this.searchTerms.next(term);
  }

  protected choose(option: StarterPick): void {
    this.dialogRef.close(option);
  }

  protected attachInstead(): void {
    this.dialogRef.close("attach");
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  private search(term: string): Observable<StarterPick[]> {
    const search = term || undefined;
    switch (this.kind) {
      case "client":
        return this.clients
          .list({ search, page: 1, pageSize: PAGE_SIZE })
          .pipe(
            map((response) =>
              response.items.map((client) => ({
                id: client.id,
                label: client.displayName,
                detail: client.clientNumber,
                reference: `„${client.displayName}“ (${client.clientNumber})`,
              })),
            ),
          );
      case "case":
        return this.cases.list({ search, page: 1, pageSize: PAGE_SIZE }).pipe(
          map((response) =>
            response.items.map((item) => ({
              id: item.id,
              label: `${item.caseNumber} ${item.name}`,
              detail: item.client?.displayName ?? null,
              reference: `${item.caseNumber} („${item.name}“)`,
            })),
          ),
        );
      case "document":
        return this.documents
          .list({ search, archived: "false", page: 1, pageSize: PAGE_SIZE })
          .pipe(
            map((response) =>
              response.items
                .filter((document) => document.currentVersion)
                .map((document) => ({
                  id: document.id,
                  label: document.title,
                  detail: document.currentVersion?.originalFilename ?? null,
                  reference: `„${document.title}“ (doc:${document.id})`,
                })),
            ),
          );
      case "person":
        return this.searchPeople(term);
    }
  }

  /** Members are few; load them once and filter locally. */
  private searchPeople(term: string): Observable<StarterPick[]> {
    this.people$ ??= this.references.users().pipe(
      map((members) =>
        members.map((member) => {
          const name = [member.user.firstName, member.user.lastName]
            .filter(Boolean)
            .join(" ");
          return {
            id: member.userId,
            label: name || member.user.email,
            detail: member.user.email,
            reference: name || member.user.email,
          };
        }),
      ),
      shareReplay(1),
    );
    const needle = foldSearchText(term);
    return this.people$.pipe(
      map((people) =>
        needle
          ? people.filter((person) =>
              foldSearchText(`${person.label} ${person.detail}`).includes(
                needle,
              ),
            )
          : people,
      ),
    );
  }
}
