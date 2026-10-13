import { PriceCatalogDialogService } from "../../finance-price-sources/price-catalog-dialog.service";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { FinancialsApiClient } from "@law/api-clients";
import { PriceSourceScope, PriceSourceSummary } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideWallet,
  lucideScale,
  lucideBuilding2,
  lucideUserRound,
  lucideBriefcaseBusiness,
  lucideArrowUpRight,
  lucidePlus,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { catchError, of, switchMap, tap } from "rxjs";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { canManageBilling, canViewRetainers } from "../../../shared/billing";
import { ClientRetainerCardComponent } from "../client-retainer-card/client-retainer-card.component";

const SOURCE_GROUPS = [
  {
    scope: "WORKSPACE_PUBLIC_REFERENCE",
    label: "clients.pricing.public",
    icon: "lucideScale",
  },
  {
    scope: "COMPANY_CATALOG",
    label: "clients.pricing.office",
    icon: "lucideBuilding2",
  },
  {
    scope: "CLIENT_AGREEMENT",
    label: "clients.pricing.client",
    icon: "lucideUserRound",
  },
  {
    scope: "CASE_OVERRIDE",
    label: "clients.pricing.cases",
    icon: "lucideBriefcaseBusiness",
  },
] as const;

@Component({
  selector: "law-client-billing-section",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block min-w-0" },
  imports: [
    RouterLink,
    NgIcon,
    HlmButton,
    HlmSpinner,
    TranslatePipe,
    ClientRetainerCardComponent,
  ],
  providers: [
    provideIcons({
      lucideWallet,
      lucideScale,
      lucideBuilding2,
      lucideUserRound,
      lucideBriefcaseBusiness,
      lucideArrowUpRight,
      lucidePlus,
    }),
  ],
  templateUrl: "./client-billing-section.component.html",
})
export class ClientBillingSectionComponent {
  private readonly catalogDialog = inject(PriceCatalogDialogService);
  private readonly api = inject(FinancialsApiClient);
  private readonly auth = inject(AuthState);
  private readonly destroyRef = inject(DestroyRef);
  readonly clientId = input.required<string>();
  readonly canView = computed(() =>
    canViewRetainers(this.auth.activeWorkspace()?.role),
  );
  readonly canManage = computed(() =>
    canManageBilling(this.auth.activeWorkspace()?.role),
  );
  private readonly refresh = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);
  private readonly sources = signal<PriceSourceSummary[]>([]);
  readonly groups = computed(() =>
    SOURCE_GROUPS.map((group) => ({
      ...group,
      sources: this.sources().filter((source) => {
        if (group.scope === "CLIENT_AGREEMENT")
          return (
            source.scope === group.scope &&
            source.clientId === this.clientId() &&
            !source.caseId
          );
        if (group.scope === "CASE_OVERRIDE")
          return (
            source.clientId === this.clientId() &&
            !!source.caseId &&
            ["CASE_OVERRIDE", "CLIENT_AGREEMENT"].includes(source.scope)
          );
        return source.scope === group.scope;
      }),
    })),
  );
  /** Availability only: applying a source still depends on date, case and retainer coverage. */
  readonly generalReference = computed(
    () =>
      ["CLIENT_AGREEMENT", "COMPANY_CATALOG", "WORKSPACE_PUBLIC_REFERENCE"]
        .map((scope) => this.groups().find((group) => group.scope === scope))
        .find((group) => !!group?.sources.length) ?? null,
  );
  readonly hasClientSources = computed(() =>
    this.groups().some(
      (group) => group.scope === "CLIENT_AGREEMENT" && group.sources.length > 0,
    ),
  );

  constructor() {
    toObservable(
      computed(() => ({
        clientId: this.clientId(),
        allowed: this.canManage(),
        refresh: this.refresh(),
      })),
    )
      .pipe(
        tap((query) => {
          this.sources.set([]);
          this.error.set(false);
          this.loading.set(query.allowed);
        }),
        switchMap((query) =>
          query.allowed
            ? this.api.priceSources().pipe(
                catchError(() => {
                  this.error.set(true);
                  return of([] as PriceSourceSummary[]);
                }),
              )
            : of([] as PriceSourceSummary[]),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((sources) => {
        this.sources.set(sources);
        this.loading.set(false);
      });
  }

  view(source: PriceSourceSummary): void {
    this.catalogDialog
      .open(source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((deleted) => {
        if (deleted) this.retry();
      });
  }

  retry(): void {
    this.refresh.update((value) => value + 1);
  }

  sourceQuery(source: PriceSourceSummary) {
    return { sourceId: source.id, clientId: this.clientId() };
  }

  createQuery(scope: PriceSourceScope) {
    return { scope, clientId: this.clientId() };
  }

  referenceQuery() {
    const reference = this.generalReference();
    return reference?.sources.length === 1
      ? this.sourceQuery(reference.sources[0])
      : this.createQuery(reference?.scope ?? "CLIENT_AGREEMENT");
  }
}
