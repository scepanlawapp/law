import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  CaseReference,
  ClientReference,
  ServiceCategory,
  WorkCaptureParseResponse,
} from "@law/api-interfaces";
import {
  normalize,
  PlatformPrismaService,
  tokens,
  WorkspaceContextService,
} from "@law/core";
import { ChatModelProvider } from "@law/llm";
import { MastraChatModelProvider, openRouterModel } from "@law/mastra";
import { parseWorkCapture } from "./work-capture-parser";

export const WORK_CAPTURE_MODEL_PROVIDER = Symbol(
  "WORK_CAPTURE_MODEL_PROVIDER",
);

const PARSE_TIMEOUT_MS = 10_000;
const MAX_CANDIDATES = 5;
const ENTRY_TIME_ZONE = "Europe/Belgrade";

/** Model settings for capture parsing, read from the same env as the assistant. */
export class WorkCaptureModelConfig {
  readonly apiKey = process.env.OPENROUTER_API_KEY ?? "";
  readonly baseUrl =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  readonly model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
}

function failed(): WorkCaptureParseResponse {
  return {
    ok: false,
    clientId: null,
    clientCandidates: [],
    caseId: null,
    caseCandidates: [],
    minutes: null,
    serviceCategoryId: null,
    description: null,
  };
}

/** Rejects when the signal aborts, so a hung model call cannot hold the request. */
function abortion(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

/**
 * Suggests work-entry form values from one free-text sentence. It never writes,
 * and every failure (no key, timeout, bad model output) degrades to `ok: false`.
 */
@Injectable()
export class WorkCaptureService {
  constructor(
    private readonly db: PlatformPrismaService,
    @Optional()
    @Inject(WORK_CAPTURE_MODEL_PROVIDER)
    private readonly injectedProvider?: ChatModelProvider,
  ) {}

  async parse(text: string): Promise<WorkCaptureParseResponse> {
    try {
      return await this.parseOrThrow(text);
    } catch {
      return failed();
    }
  }

  private provider(): ChatModelProvider | null {
    if (this.injectedProvider) return this.injectedProvider;
    const config = new WorkCaptureModelConfig();
    if (!config.apiKey) return null;
    return new MastraChatModelProvider(
      openRouterModel({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      }),
    );
  }

  private async parseOrThrow(text: string): Promise<WorkCaptureParseResponse> {
    const provider = this.provider();
    if (!provider) return failed();

    const workspaceId = WorkspaceContextService.required.workspaceId;
    const categoryRows = await this.db.serviceCategory.findMany({
      where: { workspaceId, active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
    const categories: ServiceCategory[] = categoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      order: row.order,
    }));

    const signal = AbortSignal.timeout(PARSE_TIMEOUT_MS);
    const parsed = await Promise.race([
      parseWorkCapture(provider, {
        text,
        today: this.today(),
        categories,
      }),
      abortion(signal),
    ]);

    const client = parsed.clientName
      ? await this.resolveClient(workspaceId, parsed.clientName)
      : { id: null, candidates: [] as ClientReference[] };
    const caseMatch = parsed.caseHint
      ? await this.resolveCase(workspaceId, parsed.caseHint, client.id)
      : { id: null, candidates: [] as CaseReference[] };

    const wantedCategory = parsed.categoryName
      ? normalize(parsed.categoryName)
      : null;
    const category = wantedCategory
      ? categories.find((item) => normalize(item.name) === wantedCategory)
      : undefined;

    return {
      ok: true,
      clientId: client.id,
      clientCandidates: client.candidates,
      caseId: caseMatch.id,
      caseCandidates: caseMatch.candidates,
      minutes: parsed.minutes,
      serviceCategoryId: category?.id ?? null,
      description: parsed.description,
    };
  }

  private today(): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ENTRY_TIME_ZONE,
    }).format(new Date());
  }

  private async resolveClient(
    workspaceId: string,
    name: string,
  ): Promise<{ id: string | null; candidates: ClientReference[] }> {
    const rows = await this.db.client.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        clientNumber: true,
        type: true,
        displayName: true,
        status: true,
      },
      orderBy: { displayName: "asc" },
    });
    const matches = pickMatches(rows, name, (row) => [row.displayName]);
    return {
      id: matches.length === 1 ? matches[0].id : null,
      candidates: matches.length === 1 ? [] : matches,
    };
  }

  private async resolveCase(
    workspaceId: string,
    hint: string,
    clientId: string | null,
  ): Promise<{ id: string | null; candidates: CaseReference[] }> {
    const rows = await this.db.case.findMany({
      where: {
        workspaceId,
        status: { not: "ARCHIVED" },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        caseNumber: true,
        name: true,
        status: true,
        priority: true,
      },
      orderBy: { name: "asc" },
    });
    const matches = pickMatches(rows, hint, (row) => [
      row.caseNumber,
      row.name,
    ]);
    return {
      id: matches.length === 1 ? matches[0].id : null,
      candidates: matches.length === 1 ? [] : matches,
    };
  }
}

/**
 * Exact normalized equality wins outright; otherwise every row whose fields
 * contain all of the wanted words is a candidate (at most five).
 */
function pickMatches<T>(
  rows: T[],
  wanted: string,
  fields: (row: T) => string[],
): T[] {
  const needle = normalize(wanted);
  if (!needle) return [];
  const exact = rows.filter((row) =>
    fields(row).some((field) => normalize(field) === needle),
  );
  if (exact.length > 0) return exact.slice(0, MAX_CANDIDATES);
  const wantedTokens = tokens(needle);
  if (wantedTokens.length === 0) return [];
  return rows
    .filter((row) =>
      fields(row).some((field) => {
        const fieldTokens = tokens(normalize(field));
        return wantedTokens.every((token) =>
          fieldTokens.some((candidate) => candidate.includes(token)),
        );
      }),
    )
    .slice(0, MAX_CANDIDATES);
}
