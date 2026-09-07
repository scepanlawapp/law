import { Injectable, signal } from "@angular/core";

export type TranslationParams = Record<string, string | number>;

type TranslationCatalog = Record<string, string>;

@Injectable({ providedIn: "root" })
export class LocalizationService {
  private readonly catalog = signal<TranslationCatalog>({});

  async load(): Promise<void> {
    const response = await fetch("i18n/ser.json");
    if (!response.ok) {
      throw new Error(`Unable to load translations: ${response.status}`);
    }

    this.catalog.set((await response.json()) as TranslationCatalog);
  }

  translate(key: string, params: TranslationParams = {}): string {
    const template = this.catalog()[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? `{${name}}`),
    );
  }
}
