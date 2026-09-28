export interface RuntimeConfig {
  apiUrl: string;
  apiPrefix: string;
}

const defaultConfig: RuntimeConfig = {
  apiUrl: "http://localhost:3001",
  apiPrefix: "/api",
};

/** Local, uncommitted overrides first; the shipped config otherwise. */
const LOCAL_CONFIG_URL = "/config.local.json";
const CONFIG_URL = "/config.json";

let runtimeConfig = defaultConfig;

export async function loadRuntimeConfig(): Promise<void> {
  const config =
    (await fetchLocalConfig()) ?? (await fetchConfig(CONFIG_URL));
  runtimeConfig = { ...defaultConfig, ...config } as RuntimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}

async function fetchConfig(url: string): Promise<Partial<RuntimeConfig>> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Unable to load runtime config: ${response.status}`);
  return (await response.json()) as Partial<RuntimeConfig>;
}

/**
 * `config.local.json` is optional. A dev server answers a missing file with
 * index.html, so anything that is not a JSON object counts as absent.
 */
async function fetchLocalConfig(): Promise<Partial<RuntimeConfig> | null> {
  try {
    const response = await fetch(LOCAL_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const config: unknown = await response.json();
    return config && typeof config === "object" && !Array.isArray(config)
      ? (config as Partial<RuntimeConfig>)
      : null;
  } catch {
    return null;
  }
}
