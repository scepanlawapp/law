const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildStorageKey(
  workspaceId: string,
  storedFileId: string,
): string {
  return `${workspaceId}/${storedFileId}/content`;
}

export function assertStorageKey(key: string): {
  workspaceId: string;
  storedFileId: string;
} {
  const parts = key.split("/");
  if (parts.length !== 3 || parts[2] !== "content") {
    throw new Error("Invalid storage key");
  }
  const [workspaceId, storedFileId] = parts;
  if (!UUID.test(workspaceId) || !UUID.test(storedFileId)) {
    throw new Error("Invalid storage key");
  }
  return { workspaceId, storedFileId };
}

export function isPartialStorageKey(key: string): boolean {
  const parts = key.split("/");
  return (
    parts.length === 3 &&
    UUID.test(parts[0] ?? "") &&
    UUID.test(parts[1] ?? "") &&
    /^content\.partial-[A-Za-z0-9-]+$/.test(parts[2] ?? "")
  );
}
