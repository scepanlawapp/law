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
import { apiErrorInterceptor } from "./core/http/api-error.interceptor";
import { ThemeService } from "./core/theme/theme.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([apiErrorInterceptor, authInterceptor])),
    AuthState,
    ThemeService,
    provideAppInitializer(() => inject(LocalizationService).load()),
    provideAppInitializer(() => inject(AuthState).bootstrap()),
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
  ],
};
