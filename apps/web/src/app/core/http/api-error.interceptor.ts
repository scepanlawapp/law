import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { ToastService } from "../../shared/ui/toast/toast.service";

export const SKIP_GLOBAL_ERROR_TOAST = new HttpContextToken<boolean>(
  () => false,
);

const UNSAFE_MESSAGE_PATTERN =
  /\b(sql|query|database|stack trace|stacktrace|exception|errno|node_modules|select\s+.+\s+from)\b/i;

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const toast = inject(ToastService);

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (
        request.context.get(SKIP_GLOBAL_ERROR_TOAST) ||
        error.status === 401 ||
        request.url.includes("/auth/")
      ) {
        return throwError(() => error);
      }

      const message = getFriendlyErrorMessage(error);
      if (message) {
        toast.error(message);
      }

      return throwError(() => error);
    }),
  );
};

function getFriendlyErrorMessage(error: HttpErrorResponse): string | null {
  switch (error.status) {
    case 0:
      return "The server cannot be reached right now. Please try again.";
    case 400:
      return (
        getSafeServerMessage(error) ??
        "Please check the information and try again."
      );
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 409:
      return (
        getSafeServerMessage(error) ??
        "This action conflicts with the current state. Please try again."
      );
    case 500:
      return "Something went wrong on the server. Please try again.";
    default:
      return null;
  }
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
