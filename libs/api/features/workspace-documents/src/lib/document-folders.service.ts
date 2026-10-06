import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentFolder, Prisma } from "@prisma/client";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { toLatin } from "@law/transliteration";
import { basename } from "node:path";
import {
  DocumentFolderBrowseResponse,
  EnsureDocumentFoldersResponse,
} from "@law/api-interfaces";
import {
  DocumentFolderQueryDto,
  EnsureDocumentFoldersDto,
  UpdateDocumentFolderDto,
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
        ...(query.archived === "true" && !query.parentId
          ? {
              archivedAt: { not: null },
              OR: [{ parentId: null }, { parent: { archivedAt: null } }],
            }
          : {
              parentId: query.parentId ?? null,
              archivedAt: query.archived === "true" ? { not: null } : null,
            }),
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
            where: {
              id: input.targetParentFolderId,
              workspaceId,
              archivedAt: null,
            },
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
              if (folder.archivedAt)
                throw new BadRequestException("Folder is archived");
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

  async update(id: string, input: UpdateDocumentFolderDto) {
    const { workspaceId } = WorkspaceContextService.required;
    const name =
      input.name === undefined ? undefined : folderSegments(input.name);
    if (name && name.length !== 1)
      throw new BadRequestException("Invalid folder name");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
      );
      const folder = await tx.documentFolder.findFirst({
        where: { id, workspaceId, archivedAt: null },
      });
      if (!folder) throw new NotFoundException("Folder not found");
      if (input.parentId) {
        const rows = await tx.documentFolder.findMany({
          where: { workspaceId },
        });
        let parent = rows.find((row) => row.id === input.parentId);
        if (!parent || parent.archivedAt)
          throw new NotFoundException("Folder not found");
        const visited = new Set<string>();
        while (parent) {
          if (parent.id === id || visited.has(parent.id))
            throw new BadRequestException(
              "Cannot move folder into itself or a descendant",
            );
          if (parent.archivedAt)
            throw new BadRequestException("Destination is archived");
          visited.add(parent.id);
          parent = rows.find((row) => row.id === parent?.parentId);
        }
      }
      const parentId =
        input.parentId === undefined ? folder.parentId : input.parentId;
      const sibling = await tx.documentFolder.findFirst({
        where: {
          workspaceId,
          parentId,
          name: name?.[0] ?? folder.name,
          id: { not: id },
        },
      });
      if (sibling)
        throw new BadRequestException("A folder with this name already exists");
      return summary(
        await tx.documentFolder.update({
          where: { id, workspaceId },
          data: { name: name?.[0], parentId },
        }),
      );
    });
  }

  async setArchived(id: string, archived: boolean) {
    const { workspaceId, userId } = WorkspaceContextService.required;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
      );
      const rows = await tx.documentFolder.findMany({ where: { workspaceId } });
      const folder = rows.find((row) => row.id === id);
      if (!folder) throw new NotFoundException("Folder not found");
      if (!!folder.archivedAt === archived) return summary(folder);
      if (
        !archived &&
        rows.some((row) => row.id === folder.parentId && row.archivedAt)
      )
        throw new BadRequestException("Restore the parent folder first");
      const ids = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) {
          if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
            ids.add(row.id);
            changed = true;
          }
        }
      }
      const archivedAt = archived ? new Date() : null;
      const priorArchive = archived ? null : folder.archivedAt;
      await tx.document.updateMany({
        where: {
          workspaceId,
          folderId: { in: [...ids] },
          archivedAt: priorArchive,
        },
        data: {
          archivedAt,
          archivedByUserId: archived ? userId : null,
          updatedByUserId: userId,
        },
      });
      await tx.documentFolder.updateMany({
        where: { workspaceId, id: { in: [...ids] }, archivedAt: priorArchive },
        data: { archivedAt },
      });
      return summary({ ...folder, archivedAt });
    });
  }

  async downloadEntries(id: string) {
    const { workspaceId } = WorkspaceContextService.required;
    const folders = await this.prisma.$queryRaw<DocumentFolder[]>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT * FROM "DocumentFolder" WHERE id = ${id} AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT f.* FROM "DocumentFolder" f JOIN subtree s ON f."parentId" = s.id WHERE f."workspaceId" = ${workspaceId}
      ) SELECT * FROM subtree LIMIT 1001
    `);
    const root = folders.find((folder) => folder.id === id);
    if (!root) throw new NotFoundException("Folder not found");
    if (folders.length > 1000)
      throw new BadRequestException("Folder download exceeds 1000 folders");
    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId,
        folderId: { in: folders.map((folder) => folder.id) },
        currentVersionId: { not: null },
      },
      select: {
        id: true,
        folderId: true,
        currentVersion: {
          select: {
            originalFilename: true,
            storedFile: { select: { sizeBytes: true } },
          },
        },
      },
      take: 251,
      orderBy: { id: "asc" },
    });
    if (
      documents.length > 250 ||
      documents.reduce(
        (size, document) =>
          size + Number(document.currentVersion?.storedFile.sizeBytes ?? 0),
        0,
      ) >
        1024 ** 3
    ) {
      throw new BadRequestException(
        "Folder download exceeds 250 files or 1 GiB",
      );
    }
    const paths = new Map<string, string>();
    const safeName = (name: string) =>
      Array.from(basename(name.replace(/\\/g, "/")))
        .map((character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
            ? "_"
            : character,
        )
        .join("")
        .replace(/^\.+$/, "_") || "file";
    const pathFor = (folder: DocumentFolder): string => {
      const cached = paths.get(folder.id);
      if (cached) return cached;
      const parent =
        folder.id === id
          ? undefined
          : folders.find((row) => row.id === folder.parentId);
      const path = `${parent ? pathFor(parent) : ""}${safeName(folder.name)}/`;
      paths.set(folder.id, path);
      return path;
    };
    const directories = folders.map(pathFor);
    const used = new Set(directories.map((path) => path.slice(0, -1)));
    const entries = documents.map((document) => {
      const directory = paths.get(document.folderId ?? "");
      if (!directory) throw new BadRequestException("Folder unavailable");
      const filename = safeName(
        document.currentVersion?.originalFilename ?? "file",
      );
      let name = `${directory}${filename}`;
      let duplicate = 0;
      while (used.has(name)) {
        duplicate += 1;
        name = `${directory}${duplicate > 1 ? `${duplicate}-` : ""}${document.id}-${filename}`;
      }
      used.add(name);
      return { id: document.id, name };
    });
    return { filename: `${safeName(root.name)}.zip`, directories, entries };
  }
}

function summary(folder: DocumentFolder) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    archivedAt: folder.archivedAt?.toISOString() ?? null,
    createdAt: folder.createdAt.toISOString(),
  };
}
