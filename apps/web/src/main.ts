import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { App } from "./app/app";
import { loadRuntimeConfig } from "./app/runtime-config";

loadRuntimeConfig()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((error: unknown) => console.error("Web bootstrap failed", error));
