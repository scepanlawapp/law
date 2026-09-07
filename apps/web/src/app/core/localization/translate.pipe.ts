import { Pipe, PipeTransform, inject } from "@angular/core";
import { LocalizationService, TranslationParams } from "./localization.service";

@Pipe({
  name: "translate",
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly localization = inject(LocalizationService);

  transform(key: string, params?: TranslationParams): string {
    return this.localization.translate(key, params);
  }
}
