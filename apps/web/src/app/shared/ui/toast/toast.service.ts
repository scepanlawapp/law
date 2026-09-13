import { Injectable } from "@angular/core";
import { toast } from "@spartan-ng/brain/sonner";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  action?: string;
  duration?: number;
}

const TOAST_DEFAULTS: Record<ToastType, { duration: number }> = {
  success: { duration: 4000 },
  error: { duration: 8000 },
  warning: { duration: 5000 },
  info: { duration: 4000 },
};

@Injectable({ providedIn: "root" })
export class ToastService {
  private readonly activeToasts = new Map<string, string | number>();

  success(message: string, options?: ToastOptions): string | number {
    return this.open("success", message, options);
  }

  error(message: string, options?: ToastOptions): string | number {
    return this.open("error", message, options);
  }

  warning(message: string, options?: ToastOptions): string | number {
    return this.open("warning", message, options);
  }

  info(message: string, options?: ToastOptions): string | number {
    return this.open("info", message, options);
  }

  private open(
    type: ToastType,
    message: string,
    options: ToastOptions = {},
  ): string | number {
    const defaults = TOAST_DEFAULTS[type];
    const key = `${type}:${message}:${options.action ?? ""}`;
    const existing = this.activeToasts.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const id = toast[type](message, {
      duration: options.duration ?? defaults.duration,
      ...(options.action
        ? { action: { label: options.action, onClick: () => undefined } }
        : {}),
      onDismiss: () => this.activeToasts.delete(key),
      onAutoClose: () => this.activeToasts.delete(key),
    });
    this.activeToasts.set(key, id);

    return id;
  }
}
