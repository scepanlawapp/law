export interface TemplateSearchClient {
  search(request: TemplateSearchRequest): Promise<TemplateSearchResult[]>;
}

export interface TemplateSearchRequest {
  collection: string;
  query: string;
  workspaceId: string;
  limit: number;
}

export interface TemplateSearchResult {
  id: string;
  score: number;
  contentReference: string;
}
