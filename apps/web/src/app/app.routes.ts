import { companyReportsGuard } from "./features/reports/prototype/reports.guard";
import {
  revenueSettingsGuard,
  revenueUnsavedGuard,
} from "./features/revenue-sharing/revenue-sharing.guard";
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
import { CompanySettingsLayoutComponent } from "./features/settings/company-settings-layout.component";
import {
  CompanySettingsComponent,
  CurrencySettingsComponent,
  InvoiceDefaultsSettingsComponent,
  InvoiceNumberingSettingsComponent,
  OtherOrganizationSettingsComponent,
  PaymentSettingsComponent,
  InvoicePaymentQrSettingsComponent,
  SefSettingsComponent,
  TaxSettingsComponent,
} from "./features/settings/organization-settings-sections.component";
import { DataSettingsComponent } from "./features/settings/data-settings.component";
import { BillingSettingsComponent } from "./features/settings/billing-settings.component";
import { billingSettingsGuard } from "./features/settings/billing-settings.guard";
import { MonthEndComponent } from "./features/finance-month-end/month-end.component";
import { monthEndGuard } from "./features/finance-month-end/month-end.guard";
import { FinanceRetainersComponent } from "./features/finance-retainers/retainers.component";
import { ClientsComponent } from "./features/clients/clients.component";
import { CasesComponent } from "./features/cases/cases.component";
import { ClientDetailComponent } from "./features/clients/client-detail.component";
import { CaseFormComponent } from "./features/cases/case-form.component";
import { CaseDetailComponent } from "./features/cases/case-detail.component";
import { DocumentsComponent } from "./features/documents/documents.component";
import { FinancePriceSourcesComponent } from "./features/finance-price-sources/finance-price-sources.component";
import { FinanceWorkReviewComponent } from "./features/finance-work-review/finance-work-review.component";
import { FinanceInvoicesComponent } from "./features/finance-invoices/finance-invoices.component";
import { FinanceInvoiceCreateComponent } from "./features/finance-invoices/finance-invoice-create.component";
import { FinanceInvoiceDetailComponent } from "./features/finance-invoices/finance-invoice-detail.component";
import { ProfitabilityComponent } from "./features/reports/profitability/profitability.component";
import { profitabilityGuard } from "./features/reports/profitability/profitability.guard";
import { ReportsComponent } from "./features/reports/reports.component";
import { WorkViewComponent } from "./features/work-management/work-view/work-view.component";
import { MyTimeComponent } from "./features/time/my-time.component";
import { TeamTimeComponent } from "./features/time/team-time.component";
import { teamTimeGuard } from "./features/time/team-time.guard";
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
    path: "finance/invoices/:id/print",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/finance-invoices/invoice-print-view.component").then(
        (module) => module.InvoicePrintViewComponent,
      ),
  },
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
          { path: "", pathMatch: "full", redirectTo: "work-review" },
          {
            path: "settings",
            canActivate: [revenueSettingsGuard],
            canDeactivate: [revenueUnsavedGuard],
            loadComponent: () =>
              import(
                "./features/revenue-sharing/revenue-sharing.component"
              ).then((m) => m.RevenueSharingComponent),
          },
          { path: "price-sources", component: FinancePriceSourcesComponent },
          { path: "work-review", component: FinanceWorkReviewComponent },
          {
            path: "invoices/new",
            component: FinanceInvoiceCreateComponent,
          },
          {
            path: "invoices/:id/edit",
            component: FinanceInvoiceCreateComponent,
          },
          {
            path: "invoices/:id",
            component: FinanceInvoiceDetailComponent,
          },
          { path: "invoices", component: FinanceInvoicesComponent },
          { path: "retainers", component: FinanceRetainersComponent },
          {
            path: "month-end",
            component: MonthEndComponent,
            canActivate: [monthEndGuard],
          },
        ],
      },
      { path: "reports", pathMatch: "full", redirectTo: "reports/overview" },
      { path: "reports/catalog", component: ReportsComponent },
      {
        path: "reports/overview",
        data: { view: "overview" },
        canActivate: [companyReportsGuard],
        loadComponent: () =>
          import("./features/reports/prototype/report-page.component").then(
            (m) => m.ReportPageComponent,
          ),
      },
      {
        path: "reports/earnings/:memberId",
        data: { view: "detail" },
        canActivate: [companyReportsGuard],
        loadComponent: () =>
          import("./features/reports/prototype/report-page.component").then(
            (m) => m.ReportPageComponent,
          ),
      },
      {
        path: "reports/earnings",
        data: { view: "earnings" },
        canActivate: [companyReportsGuard],
        loadComponent: () =>
          import("./features/reports/prototype/report-page.component").then(
            (m) => m.ReportPageComponent,
          ),
      },
      {
        path: "reports/outstanding",
        data: { view: "outstanding" },
        canActivate: [companyReportsGuard],
        loadComponent: () =>
          import("./features/reports/prototype/report-page.component").then(
            (m) => m.ReportPageComponent,
          ),
      },
      {
        path: "reports/my-earnings",
        data: { view: "personal" },

        loadComponent: () =>
          import("./features/reports/prototype/report-page.component").then(
            (m) => m.ReportPageComponent,
          ),
      },
      {
        path: "reports/profitability",
        component: ProfitabilityComponent,
        canActivate: [profitabilityGuard],
      },
      { path: "work/time", component: MyTimeComponent },
      {
        path: "work/time/team",
        component: TeamTimeComponent,
        canActivate: [teamTimeGuard],
      },
      { path: "work/time/review", redirectTo: "work/time", pathMatch: "full" },
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
          {
            path: "workspace/general",
            pathMatch: "full",
            redirectTo: "workspace",
          },
          {
            path: "workspace/company",
            pathMatch: "full",
            redirectTo: "company/details",
          },
          ...[
            "tax",
            "sef",
            "numbering",
            "payments",
            "currencies",
            "invoice-defaults",
          ].map((section) => ({
            path: `workspace/${section}`,
            pathMatch: "full" as const,
            redirectTo: `company/${section}`,
          })),
          { path: "workspace", component: WorkspaceSettingsComponent },
          {
            path: "company",
            component: CompanySettingsLayoutComponent,
            children: [
              { path: "", pathMatch: "full", redirectTo: "details" },
              { path: "details", component: CompanySettingsComponent },
              { path: "tax", component: TaxSettingsComponent },
              { path: "sef", component: SefSettingsComponent },
              {
                path: "numbering",
                component: InvoiceNumberingSettingsComponent,
              },
              { path: "other", component: OtherOrganizationSettingsComponent },
              { path: "payments", component: PaymentSettingsComponent },
              { path: "currencies", component: CurrencySettingsComponent },
              {
                path: "invoice-defaults",
                component: InvoiceDefaultsSettingsComponent,
              },
              {
                path: "payment-qr",
                component: InvoicePaymentQrSettingsComponent,
              },
            ],
          },
          {
            path: "billing",
            component: BillingSettingsComponent,
            canActivate: [billingSettingsGuard],
          },
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
