import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { appRoutes } from "./app.routes";
import { authInterceptor, AuthState } from "@law/security";
import { LocalizationService } from "./core/localization/localization.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authInterceptor])),
    AuthState,
    provideAppInitializer(() => inject(LocalizationService).load()),
    provideAppInitializer(() => inject(AuthState).bootstrap()),
  ],
};
