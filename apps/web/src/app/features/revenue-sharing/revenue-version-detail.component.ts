import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, forkJoin, of, switchMap } from "rxjs";
import { RevenueSharingApiClient } from "@law/api-clients";
import {
  RevenueHistoryEntry,
  RevenueOrigin,
  RevenueReferences,
  RevenueSpecialRule,
  REVENUE_ORIGINS,
  RevenueScope,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { REVENUE_ENUM_LABELS, labelOf } from "../../shared/models";
import { RevenueSelfOrigination } from "../../shared/models";

@Component({
  selector: "law-revenue-version-detail",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, HlmButton, HlmSpinner, TranslatePipe],
  templateUrl: "./revenue-version-detail.component.html",
})
export class RevenueVersionDetailComponent {
  private readonly api = inject(RevenueSharingApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  readonly version = signal<RevenueHistoryEntry | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly references = signal<RevenueReferences>({
    members: [],
    clients: [],
    cases: [],
    events: [],
  });
  readonly sections = computed(() => {
    this.localization.language();
    const config = this.version()?.configuration;
    if (!config) return [];
    const { agreements, specialRules, ...general } = config;
    return [
      { title: this.t("tab.general"), rows: this.rows(general) },
      ...agreements.map((agreement, i) => ({
        title: `${this.t("agreement")} ${i + 1} · ${this.member(agreement.memberId)}`,
        rows: this.rows(agreement),
      })),
      ...specialRules.map((rule, i) => ({
        title: `${this.t("specialRule")} ${i + 1} · ${this.member(rule.memberId)}`,
        rows: this.rows(rule, "", rule),
      })),
    ];
  });
  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.loading.set(true);
          this.error.set(false);
          return this.fetch(params.get("id") ?? "");
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.apply(result));
  }
  private fetch(id: string) {
    return forkJoin({
      version: this.api.getVersion(id),
      references: this.api.references(),
    }).pipe(catchError(() => of(null)));
  }
  load() {
    this.loading.set(true);
    this.error.set(false);
    this.fetch(this.route.snapshot.paramMap.get("id") ?? "")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.apply(result));
  }
  private apply(
    result: {
      version: RevenueHistoryEntry;
      references: RevenueReferences;
    } | null,
  ) {
    this.loading.set(false);
    this.error.set(!result);
    this.version.set(result?.version ?? null);
    if (result) this.references.set(result.references);
  }
  private t(key: string) {
    return this.localization.translate("revenue." + key);
  }
  private enumLabel(value: string) {
    return labelOf(REVENUE_ENUM_LABELS, value, (key) =>
      this.localization.translate(key),
    );
  }
  private member(id: string) {
    return (
      this.references().members.find((m) => m.id === id)?.name ??
      this.t("unavailable")
    );
  }
  private rows(
    value: object,
    prefix = "",
    rule?: RevenueSpecialRule,
  ): { label: string; value: string }[] {
    return Object.entries(value).flatMap(([key, field]) => {
      if (key === "id") return [];
      const label =
        (prefix ? prefix + " · " : "") +
        (REVENUE_ORIGINS.includes(key as RevenueOrigin)
          ? this.enumLabel(key)
          : this.t(key));
      if (field !== null && typeof field === "object")
        return this.rows(field, label, rule);
      let text: string;
      if (field === null || field === "") text = this.t("none");
      else if (typeof field === "boolean")
        text = this.enumLabel(
          field ? RevenueSelfOrigination.YES : RevenueSelfOrigination.NO,
        );
      else if (key === "memberId") text = this.member(String(field));
      else if (key === "scopeId" && rule) {
        const refs =
          rule.scopeType === RevenueScope.CLIENT
            ? this.references().clients
            : rule.scopeType === RevenueScope.CASE
              ? this.references().cases
              : rule.scopeType === RevenueScope.WORK_EVENT
                ? this.references().events
                : this.references().members;
        text =
          refs.find((ref) => ref.id === field)?.name ?? this.t("unavailable");
      } else if (key === "percentage")
        text = new Intl.NumberFormat(this.localization.locale(), {
          style: "percent",
          maximumFractionDigits: 2,
        }).format(Number(field) / 100);
      else if (/Date$|^effective/.test(key))
        text = new Intl.DateTimeFormat(this.localization.locale(), {
          timeZone: "UTC",
        }).format(new Date(String(field)));
      else if (key === "description" || key === "poolId") text = String(field);
      else text = this.enumLabel(String(field));
      return [{ label, value: text }];
    });
  }
}
