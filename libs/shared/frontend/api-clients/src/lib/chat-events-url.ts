export function chatEventsUrl(
  apiUrl: string,
  apiPrefix: string,
  workspaceId: string,
  sessionId: string,
  after?: string,
): string {
  const url = new URL(
    `${apiUrl}${apiPrefix}/chat/sessions/${sessionId}/events`,
  );
  url.searchParams.set("workspaceId", workspaceId);
  if (after) url.searchParams.set("after", after);
  return url.toString();
}
