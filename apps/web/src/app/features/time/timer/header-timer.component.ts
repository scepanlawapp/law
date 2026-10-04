import { Component, computed, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ClientsApiClient } from "@law/api-clients";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideSquare } from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
} from "@spartan-ng/helm/combobox";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  of,
  Subject,
  switchMap,
  tap,
} from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { formatElapsed, WorkTimerStore } from "./work-timer.store";

interface ClientOption {
  id: string;
  name: string;
}

const CLIENT_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 250;

@Component({
  selector: "law-header-timer",
  standalone: true,
  templateUrl: "./header-timer.component.html",
  imports: [
    NgIcon,
    HlmButton,
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
    HlmSpinner,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideSquare })],
})
export class HeaderTimerComponent {
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  protected readonly timer = inject(WorkTimerStore);
  protected readonly clients = signal<ClientOption[]>([]);
  protected readonly loadingClients = signal(false);
  private clientsRequested = false;
  private readonly firstLoad = new Subject<string>();
  private readonly typed = new Subject<string>();
  /** The server filters; the combobox must not filter the results again. */
  protected readonly acceptAll = () => true;

  protected readonly elapsed = computed(() =>
    formatElapsed(this.timer.elapsedSeconds()),
  );
  /** A stopped timer whose time still has to be confirmed. */
  protected readonly awaitingConfirmation = computed(() => {
    const running = this.timer.running();
    return running !== null && running.timerStartedAt === null;
  });

  constructor() {
    merge(this.firstLoad, this.typed.pipe(debounceTime(SEARCH_DEBOUNCE_MS)))
      .pipe(
        map((term) => term.trim()),
        distinctUntilChanged(),
        tap(() => this.loadingClients.set(true)),
        switchMap((term) =>
          this.clientsApi
            .list({
              page: 1,
              pageSize: CLIENT_PAGE_SIZE,
              status: "ACTIVE",
              ...(term ? { search: term } : {}),
            })
            .pipe(
              map((response) =>
                response.items.map((item) => ({
                  id: item.id,
                  name: item.displayName,
                })),
              ),
              catchError(() => of([] as ClientOption[])),
            ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((items) => {
        this.clients.set(items);
        this.loadingClients.set(false);
      });
  }

  /** The picker's trigger always shows the "start" label, never a client. */
  protected readonly startItemToString = (): string =>
    this.localization.translate("time.timer.start");

  /** Clients are only needed once somebody reaches for the picker. */
  protected loadClients(): void {
    if (this.clientsRequested) return;
    this.clientsRequested = true;
    this.firstLoad.next("");
  }

  protected searchClients(term: string): void {
    this.typed.next(term);
  }

  protected start(clientId: string | null | undefined): void {
    if (!clientId) return;
    this.timer.start({ clientId });
    // The picker reopens unfiltered after the timer stops again.
    this.firstLoad.next("");
  }
}
