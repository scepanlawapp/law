import { inject, Injectable, signal } from "@angular/core";
import { Observable, tap } from "rxjs";
import { ReferencesApiClient } from "@law/api-clients";

export interface ReferenceItem {
  id: string;
  name: string;
  isActive: boolean;
}

@Injectable({ providedIn: "root" })
export class ReferenceDataService {
  private readonly api = inject(ReferencesApiClient);

  readonly tags = signal<ReferenceItem[]>([]);
  readonly caseTypes = signal<ReferenceItem[]>([]);
  readonly practiceAreas = signal<ReferenceItem[]>([]);

  loadTags(): void {
    this.api.tags().subscribe({
      next: (items) => this.tags.set(items.filter((item) => item.isActive)),
    });
  }

  loadCaseTypes(): void {
    this.api.caseTypes().subscribe({
      next: (items) =>
        this.caseTypes.set(items.filter((item) => item.isActive)),
    });
  }

  loadPracticeAreas(): void {
    this.api.practiceAreas().subscribe({
      next: (items) =>
        this.practiceAreas.set(items.filter((item) => item.isActive)),
    });
  }

  createTag(name: string): Observable<ReferenceItem> {
    return this.api.createTag({ name }).pipe(
      tap((item) => {
        if (item.isActive) this.tags.update((items) => [...items, item]);
      }),
    );
  }

  createCaseType(name: string): Observable<ReferenceItem> {
    return this.api.createCaseType({ name }).pipe(
      tap((item) => {
        if (item.isActive) this.caseTypes.update((items) => [...items, item]);
      }),
    );
  }

  createPracticeArea(name: string): Observable<ReferenceItem> {
    return this.api.createPracticeArea({ name }).pipe(
      tap((item) => {
        if (item.isActive) {
          this.practiceAreas.update((items) => [...items, item]);
        }
      }),
    );
  }
}
