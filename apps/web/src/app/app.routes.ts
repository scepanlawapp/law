import { Route } from "@angular/router";
import { AcceptInvitationComponent } from "./accept-invitation.component";
import { ForgotPasswordComponent } from "./forgot-password.component";
import { ResetPasswordComponent } from "./reset-password.component";
import { LoginComponent } from "./auth/login/login.component";
import { authGuard } from "@law/security";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { AssistantComponent } from "./features/assistant/assistant.component";
import { MainLayoutComponent } from "./layout/main-layout/main-layout.component";

export const appRoutes: Route[] = [
  { path: "login", component: LoginComponent },
  { path: "accept-invitation", component: AcceptInvitationComponent },
  { path: "forgot-password", component: ForgotPasswordComponent },
  { path: "reset-password", component: ResetPasswordComponent },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () => MainLayoutComponent,
    children: [
      { path: "dashboard", component: DashboardComponent },
      {
        path: "assistant",
        component: AssistantComponent,
      },
    ],
  },
  { path: "**", redirectTo: "" },
];
