import { DestroyRef, inject, Injectable, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  CalendarApiClient,
  CasesApiClient,
  ClientsApiClient,
  EventsApiClient,
  ReferencesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import {
  ActivityFeedItem,
  CasePreviewRow,
  ObligationItem,
  activityLogToFeedItem,
  calendarItemToObligation,
  caseSummaryToPreviewRow,
} from "./dashboard.models";

const UPCOMING_WINDOW_DAYS = 365;
const UNFINISHED_EVENT_TASK_DEADLINE_STATUSES = [
  "SCHEDULED",
  "TODO",
  "IN_PROGRESS",
  "OPEN",
];

/**
 * Dashboard-scoped facade: owns all dashboard requests, per-section loading/error
 * state, and derived view-models, so the component stays a pure composition layer.
 */
@Injectable()
export class DashboardStore {
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly workApi = inject(WorkManagementApiClient);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly calendarApi = inject(CalendarApiClient);
  private readonly referencesApi = inject(ReferencesApiClient);
  private readonly auth = inject(AuthState);
  private readonly destroyRef = inject(DestroyRef);

  // Stat cards
  readonly statsLoading = signal(true);
  readonly statsError = signal(false);
  readonly activeCasesCount = signal<number | null>(null);
  readonly upcomingHearingsCount = signal<number | null>(null);
  readonly pendingTasksCount = signal<number | null>(null);
  readonly overdueCount = signal<number | null>(null);

  // Upcoming obligations (next 7 days)
  readonly obligationsLoading = signal(true);
  readonly obligationsError = signal(false);
  readonly obligations = signal<ObligationItem[]>([]);

  // Recent activity
  readonly activityLoading = signal(true);
  readonly activityError = signal(false);
  readonly activityItems = signal<ActivityFeedItem[]>([]);

  // Cases overview
  readonly casesLoading = signal(true);
  readonly casesError = signal(false);
  readonly casesPreview = signal<CasePreviewRow[]>([]);

  private currentWorkspaceId: string | undefined;

  private workspaceId(): string | undefined {
    return this.auth.session()?.memberships[0]?.workspaceId;
  }

  private currentUserId(): string | undefined {
    return this.auth.session()?.user.id;
  }

  refreshAll(): void {
    const workspaceId = this.workspaceId();
    if (workspaceId !== this.currentWorkspaceId) {
      this.currentWorkspaceId = workspaceId;
      this.clearAll();
    }
    this.loadStats();
    this.loadObligations();
    this.loadActivity();
    this.loadCasesPreview();
  }

  private clearAll(): void {
    this.activeCasesCount.set(null);
    this.upcomingHearingsCount.set(null);
    this.pendingTasksCount.set(null);
    this.overdueCount.set(null);
    this.obligations.set([]);
    this.activityItems.set([]);
    this.casesPreview.set([]);
  }

  loadStats(): void {
    const userId = this.currentUserId();
    if (!userId) return;
    this.statsLoading.set(true);
    this.statsError.set(false);
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    forkJoin({
      activeCases: this.casesApi.list({
        status: "ACTIVE",
        page: 1,
        pageSize: 1,
      }),
      hearings: this.eventsApi.list({
        type: "HEARING",
        status: "SCHEDULED",
        userIds: [userId],
        from: now.toISOString(),
        to: windowEnd.toISOString(),
        page: 1,
        pageSize: 1,
      }),
      pendingTasks: this.workApi.listTasks({
        assigneeUserIds: [userId],
        statuses: ["TODO", "IN_PROGRESS"],
        page: 1,
        pageSize: 1,
      }),
      overdueTasks: this.workApi.listTasks({
        assigneeUserIds: [userId],
        statuses: ["TODO", "IN_PROGRESS"],
        to: now.toISOString(),
        page: 1,
        pageSize: 1,
      }),
      overdueDeadlines: this.workApi.listDeadlines({
        responsibleUserIds: [userId],
        statuses: ["OPEN"],
        to: now.toISOString(),
        page: 1,
        pageSize: 1,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.activeCasesCount.set(result.activeCases.meta.totalItems);
          this.upcomingHearingsCount.set(result.hearings.meta.totalItems);
          this.pendingTasksCount.set(result.pendingTasks.meta.totalItems);
          this.overdueCount.set(
            result.overdueTasks.meta.totalItems +
              result.overdueDeadlines.meta.totalItems,
          );
          this.statsLoading.set(false);
        },
        error: () => {
          this.statsLoading.set(false);
          this.statsError.set(true);
        },
      });
  }

  loadObligations(): void {
    const userId = this.currentUserId();
    if (!userId) return;
    this.obligationsLoading.set(true);
    this.obligationsError.set(false);
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    this.calendarApi
      .list({
        from: now.toISOString(),
        to: windowEnd.toISOString(),
        userIds: [userId],
        sourceTypes: ["EVENT", "TASK", "DEADLINE"],
        statuses: UNFINISHED_EVENT_TASK_DEADLINE_STATUSES,
        limit: 4,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.obligations.set(response.items.map(calendarItemToObligation));
          this.obligationsLoading.set(false);
        },
        error: () => {
          this.obligationsLoading.set(false);
          this.obligationsError.set(true);
        },
      });
  }

  loadActivity(): void {
    this.activityLoading.set(true);
    this.activityError.set(false);

    forkJoin({
      activity: this.workApi.listActivity({ page: 1, pageSize: 4 }),
      users: this.referencesApi.users().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ activity, users }) => {
          const nameByUserId = new Map(
            users.map((member) => [
              member.userId,
              [member.user.firstName, member.user.lastName]
                .filter(Boolean)
                .join(" ") || member.user.email,
            ]),
          );
          this.activityItems.set(
            activity.items.map((entry) =>
              activityLogToFeedItem(
                entry,
                entry.actorUserId
                  ? (nameByUserId.get(entry.actorUserId) ?? null)
                  : null,
              ),
            ),
          );
          this.activityLoading.set(false);
        },
        error: () => {
          this.activityLoading.set(false);
          this.activityError.set(true);
        },
      });
  }

  loadCasesPreview(): void {
    this.casesLoading.set(true);
    this.casesError.set(false);

    forkJoin({
      cases: this.casesApi.list({ page: 1, pageSize: 5 }),
      clients: this.clientsApi
        .list({ page: 1, pageSize: 100 })
        .pipe(map((response) => response.items)),
      users: this.referencesApi.users(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ cases, clients, users }) => {
          const clientNameById = new Map(
            clients.map((client) => [client.id, client.displayName]),
          );
          const userNameById = new Map(
            users.map((member) => [
              member.userId,
              [member.user.firstName, member.user.lastName]
                .filter(Boolean)
                .join(" ") || member.user.email,
            ]),
          );
          this.casesPreview.set(
            cases.items.map((item) =>
              caseSummaryToPreviewRow(
                item,
                clientNameById.get(item.clientId) ?? item.clientId,
                userNameById.get(item.responsibleUserId) ??
                  item.responsibleUserId,
              ),
            ),
          );
          this.casesLoading.set(false);
        },
        error: () => {
          this.casesLoading.set(false);
          this.casesError.set(true);
        },
      });
  }
}
