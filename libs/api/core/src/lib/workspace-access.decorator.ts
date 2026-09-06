import { SetMetadata } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";

export const WORKSPACE_ROLE_KEY = "workspace-required-role";

export const WorkspaceAccess = (role?: WorkspaceRole) =>
  SetMetadata(WORKSPACE_ROLE_KEY, role);