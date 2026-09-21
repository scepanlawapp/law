export class StorageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_KEY"
      | "TRAVERSAL"
      | "NOT_FOUND"
      | "ALREADY_EXISTS"
      | "INTERRUPTED"
      | "DISK"
      | "UNSUPPORTED_CONNECTION"
      | "DISABLED_CONNECTION"
      | "NO_DEFAULT_CONNECTION",
  ) {
    super(message);
    this.name = "StorageError";
  }
}
