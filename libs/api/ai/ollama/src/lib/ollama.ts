export interface OllamaClient {
  generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse>;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  format?: "text" | "json";
}

export interface OllamaGenerateResponse {
  response: string;
}
