import { Route } from "@angular/router";
import { AcceptInvitationComponent } from "./accept-invitation.component";
import { ForgotPasswordComponent } from "./forgot-password.component";
import { LoginComponent } from "./login.component";
import { ResetPasswordComponent } from "./reset-password.component";
import { authGuard } from "@law/security";

export const appRoutes: Route[] = [
  { path: "login", component: LoginComponent },
  { path: "accept-invitation", component: AcceptInvitationComponent },
  { path: "forgot-password", component: ForgotPasswordComponent },
  { path: "reset-password", component: ResetPasswordComponent },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./authenticated.component").then(
        (module) => module.AuthenticatedComponent,
      ),
  },
  { path: "**", redirectTo: "" },
];
