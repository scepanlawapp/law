import { Component, inject } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

/** Preserves legacy /tasks-deadlines?... links by forwarding them to Team work. */
@Component({
  selector: "law-tasks-deadlines-redirect",
  standalone: true,
  template: "",
})
export class TasksDeadlinesRedirectComponent {
  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);
    router.navigate(["/work/team"], {
      queryParams: route.snapshot.queryParams,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }
}
