import { Injectable, computed, signal } from "@angular/core";
import { UserSettingsLanguage } from "@law/api-interfaces";
import {
  DEFAULT_LANGUAGE,
  INTL_LOCALES,
  TRANSLATION_FILES,
} from "../../shared/models/locale";

export type TranslationParams = Record<string, string | number>;

type TranslationCatalog = Record<string, string>;

@Injectable({ providedIn: "root" })
export class LocalizationService {
  private readonly catalog = signal<TranslationCatalog>({});
  private readonly currentLanguage =
    signal<UserSettingsLanguage>(DEFAULT_LANGUAGE);

  /** The application's active UI language, updated whenever `setLanguage`/`load` resolves. */
  readonly language = this.currentLanguage.asReadonly();
  /** `Intl` locale for the active language; use it for every date/number format. */
  readonly locale = computed(() => INTL_LOCALES[this.language()]);

  async load(language: UserSettingsLanguage = DEFAULT_LANGUAGE): Promise<void> {
    const response = await fetch(`i18n/${TRANSLATION_FILES[language]}.json`);
    if (!response.ok) {
      throw new Error(`Unable to load translations: ${response.status}`);
    }

    this.catalog.set((await response.json()) as TranslationCatalog);
    this.currentLanguage.set(language);
  }

  async setLanguage(language: UserSettingsLanguage): Promise<void> {
    await this.load(language);
  }

  translate(key: string, params: TranslationParams = {}): string {
    const template = this.catalog()[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? `{${name}}`),
    );
  }
}
