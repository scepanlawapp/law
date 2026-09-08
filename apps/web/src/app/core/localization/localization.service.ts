import { Injectable, signal } from "@angular/core";

export type TranslationParams = Record<string, string | number>;

type TranslationCatalog = Record<string, string>;

@Injectable({ providedIn: "root" })
export class LocalizationService {
  private readonly catalog = signal<TranslationCatalog>({});

  async load(language: "SR" | "EN" = "SR"): Promise<void> {
    const response = await fetch(
      `i18n/${language === "EN" ? "eng" : "ser"}.json`,
    );
    if (!response.ok) {
      throw new Error(`Unable to load translations: ${response.status}`);
    }

    this.catalog.set((await response.json()) as TranslationCatalog);
  }

  async setLanguage(language: "SR" | "EN"): Promise<void> {
    await this.load(language);
  }

  translate(key: string, params: TranslationParams = {}): string {
    const template = this.catalog()[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? `{${name}}`),
    );
  }
}
