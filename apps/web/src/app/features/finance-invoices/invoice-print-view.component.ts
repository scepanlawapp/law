import { DOCUMENT } from "@angular/common";
import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  Invoice,
  InvoiceLineSummary,
  ClientDetail,
  OrganizationSettings,
} from "@law/api-interfaces";
import {
  ClientAddress,
  ClientsApiClient,
  FinancialsApiClient,
  OrganizationSettingsApiClient,
} from "@law/api-clients";
import { QRCodeComponent } from "angularx-qrcode";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { catchError, forkJoin, of, switchMap } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { formatDate, formatHoursMinutes } from "../../shared/billing";
import { InvoicePaymentQrService } from "./invoice-payment-qr.service";

export type WorkSpecificationRow = InvoiceLineSummary["workEntries"][number];

@Component({
  selector: "law-invoice-print-view",
  standalone: true,
  templateUrl: "./invoice-print-view.component.html",
  styleUrl: "./invoice-print-view.component.scss",
  imports: [RouterLink, HlmButton, HlmSpinner, TranslatePipe, QRCodeComponent],
})
export class InvoicePrintViewComponent {
  private readonly invoicesApi = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly organizationApi = inject(OrganizationSettingsApiClient);
  private readonly paymentQr = inject(InvoicePaymentQrService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly document = inject(DOCUMENT);

  readonly invoiceId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly invoice = signal<Invoice | null>(null);
  readonly client = signal<ClientDetail | null>(null);
  readonly addresses = signal<ClientAddress[]>([]);
  readonly organizationSettings = signal<OrganizationSettings | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  /**
   * "Specifikacija rada": every work entry behind the invoice lines, by
   * date. Empty when the invoice does not print it or has no entry-backed
   * lines (manual lines have nothing to specify).
   */
  readonly workSpecification = computed<WorkSpecificationRow[]>(() => {
    const invoice = this.invoice();
    if (!invoice?.printWorkSpecification) return [];
    return invoice.lines
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

  readonly issuer = computed(() => {
    const settings = this.organizationSettings();
    const company = settings?.company;
    const account =
      settings?.bankAccounts.find(
        (candidate) => candidate.id === settings.paymentQr.paymentAccountId,
      ) ??
      settings?.bankAccounts.find(
        (candidate) => candidate.active && candidate.isDefault,
      ) ??
      settings?.bankAccounts.find((candidate) => candidate.active);
    return {
      name: company?.legalName || company?.displayName || "—",
      address:
        [
          company?.addressLine1,
          company?.addressLine2,
          [company?.postalCode, company?.city].filter(Boolean).join(" "),
          company?.countryCode,
        ]
          .filter(Boolean)
          .join(", ") || "—",
      taxNumber: company?.taxId || "—",
      registrationNumber: company?.registrationNumber || "—",
      bankAccount: account?.accountNumber || account?.iban || "—",
      bankName: account?.bankName || "—",
      email: company?.email || "—",
      phone: company?.phone || "—",
      website: company?.website || "—",
    };
  });
  readonly paymentQrPayload = computed(() => {
    const invoice = this.invoice();
    return invoice
      ? this.paymentQr.generate(invoice, this.organizationSettings())
      : null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.invoicesApi
      .invoice(this.invoiceId)
      .pipe(
        switchMap((invoice) =>
          forkJoin({
            invoice: of(invoice),
            client: this.clientsApi
              .get(invoice.clientId)
              .pipe(catchError(() => of(null))),
            addresses: this.clientsApi
              .listAddresses(invoice.clientId)
              .pipe(catchError(() => of([] as ClientAddress[]))),
            organizationSettings: this.organizationApi
              .get()
              .pipe(catchError(() => of(null))),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ invoice, client, addresses, organizationSettings }) => {
          this.invoice.set(invoice);
          this.client.set(client);
          this.addresses.set(addresses);
          this.organizationSettings.set(organizationSettings);
          this.loading.set(false);
        },
        error: () => {
          this.invoice.set(null);
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
    // TODO(invoice-print): Read quantity from invoice lines when the domain
    // model supports quantities; current invoice lines represent one service.
    return 1;
  }
}
