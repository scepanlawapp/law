export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  LAWYER = "LAWYER",
  MEMBER = "MEMBER",
}

export interface AuthUser {
  id: string;
  email: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
}

export interface AuthWorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
}

export interface AuthSessionResponse {
  user: AuthUser;
  memberships: AuthWorkspaceMembership[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface InvitationAcceptRequest {
  token: string;
  password: string;
}

export interface InvitationCreateRequest {
  email: string;
  workspaceId: string;
}

export interface PasswordForgotRequest {
  email: string;
}

export interface PasswordResetRequest {
  token: string;
  password: string;
}
