import { Route } from "@angular/router";
import { AcceptInvitationComponent } from "./accept-invitation.component";
import { ForgotPasswordComponent } from "./auth/forgot-password/forgot-password.component";
import { ResetPasswordComponent } from "./auth/reset-password/reset-password.component";
import { LoginComponent } from "./auth/login/login.component";
import { AuthLayoutComponent } from "./auth/auth-layout/auth-layout.component";
import { authGuard } from "@law/security";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { AssistantComponent } from "./features/assistant/assistant.component";
import { MainLayoutComponent } from "./layout/main-layout/main-layout.component";
import { CalendarComponent } from "./features/calendar/calendar.component";
import { NotificationsComponent } from "./features/notifications/notifications.component";
import { SettingsComponent } from "./features/settings/settings.component";
import { ProfileSettingsComponent } from "./features/settings/profile-settings.component";
import { AppearanceSettingsComponent } from "./features/settings/appearance-settings.component";
import { WorkspaceSettingsComponent } from "./features/settings/workspace-settings.component";
import { DataSettingsComponent } from "./features/settings/data-settings.component";
import { ClientsComponent } from "./features/clients/clients.component";
import { CasesComponent } from "./features/cases/cases.component";
import { ClientDetailComponent } from "./features/clients/client-detail.component";
import { CaseFormComponent } from "./features/cases/case-form.component";
import { CaseDetailComponent } from "./features/cases/case-detail.component";
import { DocumentsComponent } from "./features/documents/documents.component";
import { FinanceOverviewComponent } from "./features/finance-overview/finance-overview.component";
import { FinanceClientBalancesComponent } from "./features/finance-client-balances/finance-client-balances.component";
import { FinanceClientStatementComponent } from "./features/finance-client-statement/finance-client-statement.component";
import { FinancePriceSourcesComponent } from "./features/finance-price-sources/finance-price-sources.component";
import { FinanceWorkReviewComponent } from "./features/finance-work-review/finance-work-review.component";
import { ReportsComponent } from "./features/reports/reports.component";
import { WorkViewComponent } from "./features/work-management/work-view/work-view.component";
import { TasksDeadlinesRedirectComponent } from "./features/work-management/tasks-deadlines-redirect.component";

export const appRoutes: Route[] = [
  {
    path: "login",
    component: AuthLayoutComponent,
    children: [{ path: "", component: LoginComponent }],
  },
  {
    path: "forgot-password",
    component: AuthLayoutComponent,
    children: [{ path: "", component: ForgotPasswordComponent }],
  },
  {
    path: "reset-password",
    component: AuthLayoutComponent,
    children: [{ path: "", component: ResetPasswordComponent }],
  },
  { path: "accept-invitation", component: AcceptInvitationComponent },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () => MainLayoutComponent,
    children: [
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
      { path: "dashboard", component: DashboardComponent },
      { path: "clients", component: ClientsComponent },
      { path: "clients/:clientId", component: ClientDetailComponent },
      { path: "cases", component: CasesComponent },
      { path: "cases/new", component: CaseFormComponent },
      { path: "cases/:caseId/edit", component: CaseFormComponent },
      { path: "cases/:caseId", component: CaseDetailComponent },
      { path: "documents", component: DocumentsComponent },
      { path: "calendar", component: CalendarComponent },
      { path: "notifications", component: NotificationsComponent },
      {
        path: "finance",
        children: [
          { path: "", pathMatch: "full", redirectTo: "overview" },
          { path: "overview", component: FinanceOverviewComponent },
          { path: "client-balances", component: FinanceClientBalancesComponent },
          { path: "client-statement", component: FinanceClientStatementComponent },
          { path: "price-sources", component: FinancePriceSourcesComponent },
          { path: "work-review", component: FinanceWorkReviewComponent },
        ],
      },
      { path: "reports", component: ReportsComponent },
      { path: "work/:mode", component: WorkViewComponent },
      {
        path: "tasks-deadlines",
        component: TasksDeadlinesRedirectComponent,
      },
      {
        path: "settings",
        component: SettingsComponent,
        children: [
          { path: "", pathMatch: "full", redirectTo: "profile" },
          { path: "profile", component: ProfileSettingsComponent },
          { path: "appearance", component: AppearanceSettingsComponent },
          { path: "workspace", component: WorkspaceSettingsComponent },
          { path: "data", component: DataSettingsComponent },
        ],
      },
      {
        path: "assistant",
        component: AssistantComponent,
      },
    ],
  },
  { path: "**", redirectTo: "dashboard" },
];
