import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentFolder, Prisma } from "@prisma/client";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { toLatin } from "@law/transliteration";
import {
  DocumentFolderBrowseResponse,
  EnsureDocumentFoldersResponse,
} from "@law/api-interfaces";
import {
  DocumentFolderQueryDto,
  EnsureDocumentFoldersDto,
} from "./documents.dto";

export function folderSegments(path: string): string[] {
  const parts = path.replace(/\\/g, "/").split("/");
  if (
    path.length > 1024 ||
    parts.length > 32 ||
    parts.some(
      (part) =>
        !part.trim() ||
        part.trim() === "." ||
        part.trim() === ".." ||
        part.length > 255 ||
        Array.from(part).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ),
    )
  ) {
    throw new BadRequestException("Invalid folder path");
  }
  return parts.map((part) => toLatin(part.normalize("NFC").trim()));
}

@Injectable()
export class DocumentFoldersService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async browse(
    query: DocumentFolderQueryDto,
  ): Promise<DocumentFolderBrowseResponse> {
    const { workspaceId } = WorkspaceContextService.required;
    const breadcrumbs = query.parentId
      ? await this.prisma.$queryRaw<DocumentFolder[]>(Prisma.sql`
      WITH RECURSIVE ancestors AS (
        SELECT *, 0 AS depth FROM "DocumentFolder" WHERE id = ${query.parentId} AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT f.*, a.depth + 1 FROM "DocumentFolder" f JOIN ancestors a ON f.id = a."parentId"
        WHERE f."workspaceId" = ${workspaceId}
      ) SELECT * FROM ancestors ORDER BY depth DESC
    `)
      : [];
    if (query.parentId && !breadcrumbs.length)
      throw new NotFoundException("Folder not found");
    const folders = await this.prisma.documentFolder.findMany({
      where: {
        workspaceId,
        parentId: query.parentId ?? null,
        ...(query.search?.trim()
          ? {
              name: {
                contains: toLatin(query.search.trim()),
                mode: "insensitive" as const,
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    return {
      folders: folders.map(summary),
      breadcrumbs: breadcrumbs.map(summary),
    };
  }

  async ensure(
    input: EnsureDocumentFoldersDto,
  ): Promise<EnsureDocumentFoldersResponse> {
    // Validate the whole batch before persisting anything. Return original input paths
    // as keys even when canonical Serbian Latin changes the stored display name.
    const paths = [...new Set(input.paths)].map((path) => ({
      path,
      parts: folderSegments(path),
    }));
    if (paths.length > 2000)
      throw new BadRequestException("Too many folder paths");
    const { workspaceId } = WorkspaceContextService.required;
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize concurrent imports in this workspace; SQL uniqueness also protects
        // root siblings (NULLS NOT DISTINCT) and writes outside this endpoint.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
        );
        if (
          input.targetParentFolderId &&
          !(await tx.documentFolder.findFirst({
            where: { id: input.targetParentFolderId, workspaceId },
          }))
        ) {
          throw new NotFoundException("Folder not found");
        }
        const resolved = new Map<string, string>();
        const folders: EnsureDocumentFoldersResponse["folders"] = [];
        for (const { path, parts } of paths) {
          let parentId = input.targetParentFolderId ?? null;
          for (let i = 0; i < parts.length; i++) {
            const key = parts.slice(0, i + 1).join("/");
            let id = resolved.get(key);
            if (!id) {
              if (resolved.size >= 2000)
                throw new BadRequestException("Too many folders");
              const where = { workspaceId, parentId, name: parts[i] };
              const folder =
                (await tx.documentFolder.findFirst({ where })) ??
                (await tx.documentFolder.create({ data: where }));
              id = folder.id;
              resolved.set(key, id);
            }
            parentId = id;
          }
          if (!parentId) throw new BadRequestException("Empty folder path");
          folders.push({ path, id: parentId });
        }
        return { folders };
      },
      { timeout: 30000 },
    );
  }
}

function summary(folder: DocumentFolder) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt.toISOString(),
  };
}
