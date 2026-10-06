import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DocumentsApiClient } from "@law/api-clients";
import { DocumentFolderSummary } from "@law/api-interfaces";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideChevronRight,
  lucideChevronDown,
  lucideFolder,
} from "@ng-icons/lucide";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogHeader,
  HlmDialogTitle,
  HlmDialogDescription,
  HlmDialogFooter,
} from "@spartan-ng/helm/dialog";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { TranslatePipe } from "../../core/localization/translate.pipe";

export interface DocumentMoveContext {
  excludedFolderIds: string[];
  sourceFolderId: string | null;
}

@Component({
  selector: "law-document-move-dialog",
  standalone: true,
  imports: [
    NgIcon,
    NgTemplateOutlet,
    HlmButton,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmSpinner,
    HlmTooltip,
    TranslatePipe,
  ],
  providers: [
    provideIcons({ lucideChevronRight, lucideChevronDown, lucideFolder }),
  ],
  template: `
    <ng-template #folderTree let-parentId>
      <ul
        [class.pl-4]="parentId !== null"
        [attr.aria-label]="
          parentId === null ? ('documents.move.destination' | translate) : null
        "
      >
        @for (folder of childrenFor(parentId); track folder.id) {
          <li>
            <div class="flex min-w-0 items-center gap-1">
              <button
                hlmBtn
                type="button"
                variant="ghost"
                size="icon-sm"
                [disabled]="loading()"
                [attr.aria-expanded]="expanded().has(folder.id)"
                [attr.aria-controls]="'move-folder-' + folder.id"
                [attr.aria-label]="
                  ('documents.move.expand' | translate) + ': ' + folder.name
                "
                [hlmTooltip]="'documents.move.expand' | translate"
                (click)="toggle(folder.id)"
              >
                <ng-icon
                  [name]="
                    expanded().has(folder.id)
                      ? 'lucideChevronDown'
                      : 'lucideChevronRight'
                  "
                  aria-hidden="true"
                />
              </button>
              <button
                hlmBtn
                type="button"
                variant="ghost"
                class="min-w-0 flex-1 justify-start"
                [disabled]="folder.id === context.sourceFolderId"
                [attr.aria-pressed]="destination() === folder.id"
                [hlmTooltip]="folder.name"
                (click)="destination.set(folder.id)"
              >
                <ng-icon name="lucideFolder" aria-hidden="true" />
                <span class="truncate">{{ folder.name }}</span>
              </button>
            </div>
            <div [id]="'move-folder-' + folder.id">
              @if (expanded().has(folder.id)) {
                <ng-container
                  [ngTemplateOutlet]="folderTree"
                  [ngTemplateOutletContext]="{ $implicit: folder.id }"
                />
              }
            </div>
          </li>
        }
      </ul>
    </ng-template>
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ "documents.actions.move" | translate }}</h2>
      <p hlmDialogDescription>{{ "documents.move.destination" | translate }}</p>
    </hlm-dialog-header>
    <div
      class="my-4 max-h-[55dvh] min-h-40 overflow-y-auto"
      [attr.aria-busy]="loading()"
    >
      <button
        hlmBtn
        type="button"
        variant="ghost"
        class="w-full justify-start"
        [disabled]="context.sourceFolderId === null"
        [attr.aria-pressed]="destination() === null"
        (click)="destination.set(null)"
      >
        <ng-icon name="lucideFolder" aria-hidden="true" />
        {{ "documents.move.root" | translate }}
      </button>
      <ng-container
        [ngTemplateOutlet]="folderTree"
        [ngTemplateOutletContext]="{ $implicit: null }"
      />
      @if (loading()) {
        <hlm-spinner [attr.aria-label]="'documents.loading' | translate" />
      }
      @if (error()) {
        <p class="text-sm text-destructive" role="alert">
          {{ "documents.loadError" | translate }}
        </p>
        <button
          hlmBtn
          type="button"
          variant="outline"
          (click)="loadChildren(failedParent)"
        >
          {{ "documents.retry" | translate }}
        </button>
      }
    </div>
    <hlm-dialog-footer>
      <button
        hlmBtn
        type="button"
        variant="outline"
        (click)="dialogRef.close()"
      >
        {{ "common.cancel" | translate }}
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="destination() === undefined || loading() || error()"
        (click)="confirm()"
      >
        {{ "documents.move.confirm" | translate }}
      </button>
    </hlm-dialog-footer>
  `,
})
export class DocumentMoveDialogComponent implements OnInit {
  private readonly api = inject(DocumentsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly context = injectBrnDialogContext<DocumentMoveContext>();
  readonly dialogRef =
    inject<BrnDialogRef<{ folderId: string | null }>>(BrnDialogRef);
  readonly destination = signal<string | null | undefined>(undefined);
  readonly children = signal<Map<string | null, DocumentFolderSummary[]>>(
    new Map(),
  );
  readonly expanded = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly error = signal(false);
  failedParent: string | null = null;

  ngOnInit(): void {
    this.loadChildren(null);
  }

  visibleFolders(): Array<{ folder: DocumentFolderSummary; depth: number }> {
    const rows: Array<{ folder: DocumentFolderSummary; depth: number }> = [];
    const visited = new Set<string>();
    const visit = (parentId: string | null, depth: number) => {
      for (const folder of this.children().get(parentId) ?? []) {
        if (
          this.context.excludedFolderIds.includes(folder.id) ||
          visited.has(folder.id)
        )
          continue;
        visited.add(folder.id);
        rows.push({ folder, depth });
        if (this.expanded().has(folder.id)) visit(folder.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  }

  childrenFor(parentId: string | null): DocumentFolderSummary[] {
    return this.visibleFolders()
      .filter(({ folder }) => folder.parentId === parentId)
      .map(({ folder }) => folder);
  }

  toggle(id: string): void {
    if (this.loading()) return;
    const expanded = new Set(this.expanded());
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    this.expanded.set(expanded);
    if (expanded.has(id) && !this.children().has(id)) this.loadChildren(id);
  }

  loadChildren(parentId: string | null): void {
    if (this.loading()) return;
    this.failedParent = parentId;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .browseFolders(parentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ folders }) => {
          this.children.set(new Map(this.children()).set(parentId, folders));
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  confirm(): void {
    const folderId = this.destination();
    if (folderId !== undefined && !this.loading() && !this.error())
      this.dialogRef.close({ folderId });
  }
}
