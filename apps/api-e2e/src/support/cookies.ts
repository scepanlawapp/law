import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

/**
 * Minimal cookie jar for e2e specs: axios in Node keeps no cookies, so the
 * Set-Cookie headers are folded into a name -> value map by hand.
 */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }

  header(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  store(response: AxiosResponse): void {
    for (const line of response.headers["set-cookie"] ?? []) {
      const [pair, ...attributes] = line.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => {
        const [key, rawValue] = attribute.trim().split("=");
        return (
          key.toLowerCase() === "expires" &&
          !Number.isNaN(Date.parse(rawValue)) &&
          Date.parse(rawValue) <= Date.now()
        );
      });
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request<T = unknown>(
    method: "get" | "post" | "delete",
    url: string,
    data?: unknown,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse<T>> {
    const response = await axios.request<T>({
      ...config,
      method,
      url,
      data,
      headers: {
        ...config.headers,
        ...(this.cookies.size > 0 ? { Cookie: this.header() } : {}),
      },
    });
    this.store(response);
    return response;
  }
}
