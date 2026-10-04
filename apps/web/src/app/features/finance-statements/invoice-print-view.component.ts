import { DOCUMENT } from "@angular/common";
import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  BillingStatement,
  BillingStatementLineSummary,
  ClientDetail,
} from "@law/api-interfaces";
import {
  ClientAddress,
  ClientsApiClient,
  FinancialsApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { catchError, forkJoin, of, switchMap } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { formatDate, formatHoursMinutes } from "../../shared/billing";

export type WorkSpecificationRow =
  BillingStatementLineSummary["workEntries"][number];

@Component({
  selector: "law-invoice-print-view",
  standalone: true,
  templateUrl: "./invoice-print-view.component.html",
  styleUrl: "./invoice-print-view.component.scss",
  imports: [RouterLink, HlmButton, HlmSpinner, TranslatePipe],
})
export class InvoicePrintViewComponent {
  private readonly statementsApi = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly document = inject(DOCUMENT);

  readonly statementId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly statement = signal<BillingStatement | null>(null);
  readonly client = signal<ClientDetail | null>(null);
  readonly addresses = signal<ClientAddress[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  /**
   * "Specifikacija rada": every work entry behind the statement lines, by
   * date. Empty when the statement does not print it or has no entry-backed
   * lines (manual lines have nothing to specify).
   */
  readonly workSpecification = computed<WorkSpecificationRow[]>(() => {
    const statement = this.statement();
    if (!statement?.printWorkSpecification) return [];
    return statement.lines
      .flatMap((line) => line.workEntries)
      .sort((a, b) => a.workDate.localeCompare(b.workDate));
  });
  readonly workSpecificationMinutes = computed(() =>
    this.workSpecification().reduce(
      (total, entry) => total + (entry.minutes ?? 0),
      0,
    ),
  );
  readonly primaryAddress = computed(
    () =>
      this.addresses().find((address) => address.isPrimary) ??
      this.addresses()[0] ??
      null,
  );

  // TODO(invoice-print): Replace these placeholders with the workspace billing
  // profile once issuer identity, contact, and banking settings are persisted.
  readonly issuer = {
    name: "LEGAL AI DOO",
    address: "Bulevar Mihajla Pupina 10, 11070 Novi Beograd, Srbija",
    taxNumber: "112233445",
    registrationNumber: "12345678",
    bankAccount: "160-123456-78",
    bankName: "Banca Intesa a.d.",
    email: "office@legalai.rs",
    phone: "+381 11 123 4567",
    website: "www.legalai.rs",
  };

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.statementsApi
      .statement(this.statementId)
      .pipe(
        switchMap((statement) =>
          forkJoin({
            statement: of(statement),
            client: this.clientsApi
              .get(statement.clientId)
              .pipe(catchError(() => of(null))),
            addresses: this.clientsApi
              .listAddresses(statement.clientId)
              .pipe(catchError(() => of([] as ClientAddress[]))),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ statement, client, addresses }) => {
          this.statement.set(statement);
          this.client.set(client);
          this.addresses.set(addresses);
          this.loading.set(false);
        },
        error: () => {
          this.statement.set(null);
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  print(): void {
    this.document.defaultView?.print();
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { day: "numeric", month: "numeric", year: "numeric" },
    ).format(new Date(value));
  }

  formatWorkDate(value: string): string {
    return formatDate(value.slice(0, 10), this.localization.language());
  }

  formatDuration(minutes: number | null): string {
    return minutes === null ? "—" : formatHoursMinutes(minutes);
  }

  formatAmount(value: string): string {
    return new Intl.NumberFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(Number(value));
  }

  formatCurrency(value: string, currency: string): string {
    return `${this.formatAmount(value)} ${currency}`;
  }

  clientAddress(address: ClientAddress | null): string {
    if (!address) {
      return "—";
    }
    return [
      [address.street, address.streetAdditional].filter(Boolean).join(" "),
      [address.postalCode, address.city].filter(Boolean).join(" "),
      address.country,
    ]
      .filter(Boolean)
      .join(", ");
  }

  lineQuantity(): number {
    // TODO(invoice-print): Read quantity from statement lines when the domain
    // model supports quantities; current statement lines represent one service.
    return 1;
  }
}
