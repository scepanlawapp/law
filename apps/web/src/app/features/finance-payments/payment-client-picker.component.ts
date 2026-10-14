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
@Component({
  selector: "law-payment-client-picker",
  standalone: true,
  imports: [HlmComboboxImports, HlmButton, HlmSpinner],
  template: `
    <label class="mb-1 block text-sm" [for]="controlId()">Klijent</label>
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
          <hlm-combobox-value placeholder="Izaberite klijenta" />
        </hlm-combobox-trigger>
        <hlm-combobox-content *hlmComboboxPortal>
          <hlm-combobox-input
            placeholder="Pretraži klijente"
            [showTrigger]="false"
          />
          @if (loading()) {
            <hlm-spinner />
          }
          @if (error()) {
            <p role="alert">Klijenti nisu učitani. Ponovite pretragu.</p>
          }
          <hlm-combobox-empty>Nema rezultata.</hlm-combobox-empty>
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
          aria-label="Ukloni klijenta"
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
  private readonly names = signal(new Map<string, string>());
  readonly keepResults = () => true;
  readonly display = (id: string) =>
    this.names().get(id) || this.selectedLabel() || "Izabrani klijent";
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
          this.api.list({ page: 1, pageSize: 100, search }).pipe(
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
