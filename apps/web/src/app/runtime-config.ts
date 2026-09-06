export interface RuntimeConfig {
  apiUrl: string;
  apiPrefix: string;
}

const defaultConfig: RuntimeConfig = {
  apiUrl: "http://localhost:3000",
  apiPrefix: "/api",
};

let runtimeConfig = defaultConfig;

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch("/config.json");

  if (!response.ok) {
    throw new Error(`Unable to load runtime config: ${response.status}`);
  }

  runtimeConfig = {
    ...defaultConfig,
    ...(await response.json()),
  } as RuntimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}
