/**
 * Injectable HTTP client for platform adapters.
 *
 * Adapters depend on this interface, never on global fetch directly, so they are
 * fully unit-testable offline with fixtures. The default implementation adds
 * retry-with-backoff on transient failures (429 / 5xx / network errors).
 */

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpClient {
  getJson<T>(url: string, init?: RequestInit): Promise<T>;
  getText(url: string, init?: RequestInit): Promise<string>;
  postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpClientOptions {
  fetch?: FetchLike;
  retries?: number;
  backoffMs?: number;
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl: FetchLike =
    options.fetch ?? ((input, init) => fetch(input, init));
  const retries = options.retries ?? 3;
  const backoffMs = options.backoffMs ?? 300;
  const baseHeaders = options.headers ?? {};

  async function request(url: string, init?: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetchImpl(url, {
          ...init,
          headers: { ...baseHeaders, ...(init?.headers as Record<string, string>) },
        });
        if (!response.ok && isRetryable(response.status) && attempt < retries) {
          await sleep(backoffMs * 2 ** attempt);
          continue;
        }
        if (!response.ok) {
          throw new HttpError(
            `Request failed (${response.status}) for ${url}`,
            response.status,
            url,
          );
        }
        return response;
      } catch (error) {
        lastError = error;
        if (error instanceof HttpError && !isRetryable(error.status)) throw error;
        if (attempt < retries) {
          await sleep(backoffMs * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`Request failed for ${url}`);
  }

  return {
    async getJson<T>(url: string, init?: RequestInit): Promise<T> {
      const response = await request(url, { ...init, method: "GET" });
      return (await response.json()) as T;
    },
    async getText(url: string, init?: RequestInit): Promise<string> {
      const response = await request(url, { ...init, method: "GET" });
      return await response.text();
    },
    async postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
      const response = await request(url, {
        ...init,
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(init?.headers as Record<string, string>),
        },
        body: JSON.stringify(body),
      });
      return (await response.json()) as T;
    },
  };
}
