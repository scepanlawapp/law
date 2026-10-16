import {
  Component,
  DestroyRef,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ClientsApiClient } from "@law/api-clients";
import { ClientSummary } from "@law/api-interfaces";
import { HlmComboboxImports } from "@spartan-ng/helm/combobox";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  Subject,
  catchError,
  debounceTime,
  of,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { FIRST_PAGE } from "../../shared/pagination/paginated-list";
@Component({
  selector: "law-payment-client-picker",
  standalone: true,
  imports: [HlmComboboxImports, HlmButton, HlmSpinner, TranslatePipe],
  template: `
    <label class="mb-1 block text-sm" [for]="controlId()">
      {{ "payments.field.client" | translate }}
    </label>
    <div class="flex items-center gap-2">
      <div
        hlmCombobox
        class="min-w-0 flex-1"
        [value]="value()"
        (valueChange)="value.set($event ?? '')"
        [itemToString]="display"
        [filter]="keepResults"
        (searchChange)="search.next($event)"
      >
        <hlm-combobox-trigger [buttonId]="controlId()" class="w-full min-w-0">
          <hlm-combobox-value
            [placeholder]="'payments.client.select' | translate"
          />
        </hlm-combobox-trigger>
        <hlm-combobox-content *hlmComboboxPortal>
          <hlm-combobox-input
            [placeholder]="'payments.client.search' | translate"
            [showTrigger]="false"
          />
          @if (loading()) {
            <hlm-spinner />
          }
          @if (error()) {
            <p role="alert">{{ "payments.client.loadError" | translate }}</p>
          }
          <hlm-combobox-empty>
            {{ "common.noResults" | translate }}
          </hlm-combobox-empty>
          <div hlmComboboxList>
            @for (c of clients(); track c.id) {
              <hlm-combobox-item [value]="c.id">
                {{ c.displayName }}
              </hlm-combobox-item>
            }
          </div>
        </hlm-combobox-content>
      </div>
      @if (value()) {
        <button
          hlmBtn
          type="button"
          variant="ghost"
          size="icon"
          (click)="value.set('')"
          [attr.aria-label]="'payments.client.remove' | translate"
        >
          <span aria-hidden="true">×</span>
        </button>
      }
    </div>
  `,
})
export class PaymentClientPickerComponent {
  readonly controlId = input("payment-client");
  readonly value = model("");
  readonly selectedLabel = input("");
  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly search = new Subject<string>();
  private readonly api = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly names = signal(new Map<string, string>());
  readonly keepResults = () => true;
  readonly display = (id: string) =>
    this.names().get(id) ||
    this.selectedLabel() ||
    this.localization.translate("payments.client.selected");
  constructor() {
    this.search
      .pipe(
        startWith(""),
        debounceTime(200),
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap((search) =>
          this.api.list({ ...FIRST_PAGE, search }).pipe(
            catchError(() => {
              this.error.set(true);
              return of({ items: [] });
            }),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((r) => {
        const names = new Map(this.names());
        r.items.forEach((c) => names.set(c.id, c.displayName));
        this.names.set(names);
        this.clients.set(r.items);
        this.loading.set(false);
      });
  }
}
