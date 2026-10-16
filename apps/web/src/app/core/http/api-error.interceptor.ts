import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { LocalizationService } from "../localization/localization.service";

export const SKIP_GLOBAL_ERROR_TOAST = new HttpContextToken<boolean>(
  () => false,
);

const UNSAFE_MESSAGE_PATTERN =
  /\b(sql|query|database|stack trace|stacktrace|exception|errno|node_modules|select\s+.+\s+from)\b/i;

/** Fallback message per HTTP status; 400 and 409 prefer a safe server message. */
const HTTP_ERROR_LABELS: Readonly<Record<number, string>> = {
  0: "errors.http.unreachable",
  400: "errors.http.badRequest",
  403: "errors.http.forbidden",
  404: "errors.http.notFound",
  409: "errors.http.conflict",
  500: "errors.http.server",
};
const SERVER_MESSAGE_STATUSES: ReadonlySet<number> = new Set([400, 409]);

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const toast = inject(ToastService);
  const localization = inject(LocalizationService);

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (
        request.context.get(SKIP_GLOBAL_ERROR_TOAST) ||
        error.status === 401 ||
        request.url.includes("/auth/")
      ) {
        return throwError(() => error);
      }

      const message = getFriendlyErrorMessage(error, (key) =>
        localization.translate(key),
      );
      if (message) {
        toast.error(message);
      }

      return throwError(() => error);
    }),
  );
};

function getFriendlyErrorMessage(
  error: HttpErrorResponse,
  translate: (key: string) => string,
): string | null {
  const key = HTTP_ERROR_LABELS[error.status];
  if (!key) return null;
  const serverMessage = SERVER_MESSAGE_STATUSES.has(error.status)
    ? getSafeServerMessage(error)
    : null;
  return serverMessage ?? translate(key);
}

function getSafeServerMessage(error: HttpErrorResponse): string | null {
  const message = getErrorMessage(error.error);
  if (
    !message ||
    message.length > 160 ||
    UNSAFE_MESSAGE_PATTERN.test(message)
  ) {
    return null;
  }

  return message;
}

function getErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("message" in body)) {
    return null;
  }

  const message = body.message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}
