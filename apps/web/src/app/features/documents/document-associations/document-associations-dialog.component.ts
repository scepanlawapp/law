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
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxChip,
  HlmComboboxChipInput,
  HlmComboboxChips,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxValues,
} from "@spartan-ng/helm/combobox";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  Subject,
} from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  DocumentAssociationOption,
  DocumentAssociationsDialogContext,
  DocumentAssociationsDialogResult,
} from "./document-associations-dialog.models";

@Component({
  selector: "law-document-associations-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./document-associations-dialog.component.html",
  imports: [
    HlmButton,
    HlmComboboxChip,
    HlmComboboxChipInput,
    HlmComboboxChips,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxValues,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmSpinner,
    TranslatePipe,
  ],
})
export class DocumentAssociationsDialogComponent {
  private readonly context =
    injectBrnDialogContext<DocumentAssociationsDialogContext>();
  private readonly dialogRef = inject(
    BrnDialogRef<DocumentAssociationsDialogResult>,
  );
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly caseSearch = new Subject<string>();
  private readonly clientSearch = new Subject<string>();

  readonly documentTitle = this.context.documentTitle;
  readonly allowCasePicker = !this.context.fixedCaseId;
  readonly allowClientPicker = !this.context.fixedClientId;
  readonly selectedCaseIds = signal(
    this.withFixedId(
      this.context.caseOptions.map((option) => option.id),
      this.context.fixedCaseId,
    ),
  );
  readonly selectedClientIds = signal(
    this.withFixedId(
      this.context.clientOptions.map((option) => option.id),
      this.context.fixedClientId,
    ),
  );
  readonly caseOptions = signal(this.context.caseOptions);
  readonly clientOptions = signal(this.context.clientOptions);
  readonly caseOptionsLoading = signal(false);
  readonly clientOptionsLoading = signal(false);
  readonly caseOptionsError = signal(false);
  readonly clientOptionsError = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal(false);

  readonly caseItemToString = (value: string | null | undefined): string =>
    this.caseOptions().find((option) => option.id === value)?.label ??
    value ??
    "";
  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clientOptions().find((option) => option.id === value)?.label ??
    value ??
    "";

  constructor() {
    this.caseSearch
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((term) => this.loadCases(term));
    this.clientSearch
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((term) => this.loadClients(term));

    if (this.allowCasePicker) this.loadCases("");
    if (this.allowClientPicker) this.loadClients("");
  }

  onCaseSearch(event: Event): void {
    this.caseSearch.next((event.target as HTMLInputElement).value);
  }

  onClientSearch(event: Event): void {
    this.clientSearch.next((event.target as HTMLInputElement).value);
  }

  setCaseIds(ids: string[]): void {
    if (this.allowCasePicker) this.selectedCaseIds.set(ids);
  }

  setClientIds(ids: string[]): void {
    if (this.allowClientPicker) this.selectedClientIds.set(ids);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.saveError.set(false);
    this.documentsApi
      .update(this.context.documentId, {
        caseIds: this.selectedCaseIds(),
        clientIds: this.selectedClientIds(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.dialogRef.close(updated);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(true);
        },
      });
  }

  private loadCases(term: string): void {
    this.caseOptionsLoading.set(true);
    this.caseOptionsError.set(false);
    this.casesApi
      .list({
        page: 1,
        pageSize: 20,
        search: term || undefined,
        ...(this.context.fixedClientId
          ? { clientIds: [this.context.fixedClientId] }
          : {}),
      })
      .pipe(
        catchError(() => {
          this.caseOptionsError.set(true);
          return of({ items: [] as never[] });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        const matches = (response.items ?? []).map((item) => ({
          id: item.id,
          label: `${item.caseNumber} ${item.name}`.trim(),
        }));
        this.caseOptions.set(
          this.withSelectedOptions(
            matches,
            this.caseOptions(),
            this.selectedCaseIds(),
          ),
        );
        this.caseOptionsLoading.set(false);
      });
  }

  private loadClients(term: string): void {
    this.clientOptionsLoading.set(true);
    this.clientOptionsError.set(false);
    this.clientsApi
      .list({ page: 1, pageSize: 20, search: term || undefined })
      .pipe(
        catchError(() => {
          this.clientOptionsError.set(true);
          return of({ items: [] as never[] });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        const matches = (response.items ?? []).map((item) => ({
          id: item.id,
          label: item.displayName,
        }));
        this.clientOptions.set(
          this.withSelectedOptions(
            matches,
            this.clientOptions(),
            this.selectedClientIds(),
          ),
        );
        this.clientOptionsLoading.set(false);
      });
  }

  private withSelectedOptions(
    matches: DocumentAssociationOption[],
    previous: DocumentAssociationOption[],
    selectedIds: string[],
  ): DocumentAssociationOption[] {
    const options = new Map(matches.map((option) => [option.id, option]));
    for (const option of previous) {
      if (selectedIds.includes(option.id) && !options.has(option.id)) {
        options.set(option.id, option);
      }
    }
    return [...options.values()];
  }

  private withFixedId(ids: string[], fixedId?: string): string[] {
    return fixedId && !ids.includes(fixedId) ? [...ids, fixedId] : ids;
  }
}
