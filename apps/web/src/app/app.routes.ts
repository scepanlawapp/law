import { Route } from "@angular/router";
import { LoginComponent } from "./login.component";
import { authGuard } from "@law/security";

export const appRoutes: Route[] = [
  { path: "login", component: LoginComponent },
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
