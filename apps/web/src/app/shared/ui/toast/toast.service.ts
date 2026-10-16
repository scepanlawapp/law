import { Injectable } from "@angular/core";
import { toast } from "@spartan-ng/brain/sonner";

export const ToastType = {
  SUCCESS: "success",
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
} as const;
export type ToastType = (typeof ToastType)[keyof typeof ToastType];

export interface ToastOptions {
  action?: string;
  duration?: number;
}

const TOAST_DEFAULTS: Readonly<Record<ToastType, { duration: number }>> = {
  [ToastType.SUCCESS]: { duration: 4000 },
  [ToastType.ERROR]: { duration: 8000 },
  [ToastType.WARNING]: { duration: 5000 },
  [ToastType.INFO]: { duration: 4000 },
};

@Injectable({ providedIn: "root" })
export class ToastService {
  private readonly activeToasts = new Map<string, string | number>();

  success(message: string, options?: ToastOptions): string | number {
    return this.open(ToastType.SUCCESS, message, options);
  }

  error(message: string, options?: ToastOptions): string | number {
    return this.open(ToastType.ERROR, message, options);
  }

  warning(message: string, options?: ToastOptions): string | number {
    return this.open(ToastType.WARNING, message, options);
  }

  info(message: string, options?: ToastOptions): string | number {
    return this.open(ToastType.INFO, message, options);
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
