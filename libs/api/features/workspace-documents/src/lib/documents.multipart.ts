import { BadRequestException } from "@nestjs/common";
import Busboy from "busboy";
import { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

export interface ParsedDocumentUpload {
  folderId?: string;
  title?: string;
  category?: string;
  aiAccess?: boolean;
  caseIds: string[];
  clientIds: string[];
  originalFilename: string;
  stream: Readable;
}

function pushId(target: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed) target.push(trimmed);
}

export function parseDocumentUpload(
  request: IncomingMessage,
): Promise<ParsedDocumentUpload> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"];
    if (!contentType?.includes("multipart/form-data")) {
      reject(new BadRequestException("multipart/form-data is required"));
      return;
    }

    let settled = false;
    const caseIds: string[] = [];
    const clientIds: string[] = [];
    let folderId: string | undefined;
    let title: string | undefined;
    let category: string | undefined;
    let aiAccess: boolean | undefined;
    let originalFilename: string | undefined;
    let stream: Readable | undefined;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const busboy = Busboy({
      headers: request.headers,
      limits: { files: 1, fields: 50 },
    });

    busboy.on("field", (name, value) => {
      if (name === "folderId") folderId = String(value);
      else if (name === "title") title = String(value);
      else if (name === "category") category = String(value);
      else if (name === "aiAccess") {
        if (value === "true") aiAccess = true;
        else if (value === "false") aiAccess = false;
        else {
          fail(new BadRequestException("aiAccess must be true or false"));
        }
      } else if (name === "caseIds" || name === "caseIds[]")
        pushId(caseIds, value);
      else if (name === "clientIds" || name === "clientIds[]") {
        pushId(clientIds, value);
      }
    });

    busboy.on("file", (name, file, info) => {
      if (settled) {
        file.resume();
        return;
      }
      if (name !== "file") {
        file.resume();
        return;
      }
      if (stream) {
        file.resume();
        fail(new BadRequestException("Exactly one file is required"));
        return;
      }
      originalFilename = info.filename?.trim() || "upload";
      file.pause();
      stream = file;
      settled = true;
      resolve({
        folderId,
        title,
        category,
        aiAccess,
        caseIds,
        clientIds,
        originalFilename,
        stream,
      });
    });

    busboy.on("filesLimit", () => {
      fail(new BadRequestException("Exactly one file is required"));
    });
    busboy.on("error", fail);
    busboy.on("finish", () => {
      if (!stream) {
        fail(new BadRequestException("A file field named file is required"));
      }
    });

    request.pipe(busboy);
  });
}

export function requireIdempotencyKey(
  value: string | string[] | undefined,
): string {
  const key = Array.isArray(value) ? value[0] : value;
  if (!key?.trim()) {
    throw new BadRequestException("Idempotency-Key header is required");
  }
  if (key.length > 200) {
    throw new BadRequestException("Idempotency-Key is too long");
  }
  return key.trim();
}

export function sanitizeDownloadFilename(name: string): string {
  const base = name
    .replace(/[\r\n"]/g, "")
    .replace(/[/\\]/g, "_")
    .trim();
  return base || "document";
}
