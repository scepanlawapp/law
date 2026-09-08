import { Injectable, inject } from "@angular/core";
import { MatSnackBar, MatSnackBarRef } from "@angular/material/snack-bar";
import { ToastComponent } from "./toast.component";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  action?: string;
  duration?: number;
}

export interface ToastData {
  message: string;
  action?: string;
  type: ToastType;
  icon: string;
}

const TOAST_DEFAULTS: Record<ToastType, { duration: number; icon: string }> = {
  success: { duration: 4000, icon: "check_circle" },
  error: { duration: 8000, icon: "error" },
  warning: { duration: 5000, icon: "warning" },
  info: { duration: 4000, icon: "info" },
};

@Injectable({ providedIn: "root" })
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly activeToasts = new Map<
    string,
    MatSnackBarRef<ToastComponent>
  >();

  success(
    message: string,
    options?: ToastOptions,
  ): MatSnackBarRef<ToastComponent> {
    return this.open("success", message, options);
  }

  error(
    message: string,
    options?: ToastOptions,
  ): MatSnackBarRef<ToastComponent> {
    return this.open("error", message, options);
  }

  warning(
    message: string,
    options?: ToastOptions,
  ): MatSnackBarRef<ToastComponent> {
    return this.open("warning", message, options);
  }

  info(
    message: string,
    options?: ToastOptions,
  ): MatSnackBarRef<ToastComponent> {
    return this.open("info", message, options);
  }

  private open(
    type: ToastType,
    message: string,
    options: ToastOptions = {},
  ): MatSnackBarRef<ToastComponent> {
    const defaults = TOAST_DEFAULTS[type];
    const key = `${type}:${message}:${options.action ?? ""}`;
    const existing = this.activeToasts.get(key);
    if (existing) {
      return existing;
    }

    const ref = this.snackBar.openFromComponent(ToastComponent, {
      data: { message, action: options.action, type, icon: defaults.icon },
      duration: options.duration ?? defaults.duration,
      horizontalPosition: "right",
      verticalPosition: "top",
      panelClass: ["app-toast-panel", `app-toast-panel--${type}`],
      politeness: type === "error" ? "assertive" : "polite",
      announcementMessage: message,
    });
    this.activeToasts.set(key, ref);
    ref.afterDismissed().subscribe(() => this.activeToasts.delete(key));

    return ref;
  }
}
