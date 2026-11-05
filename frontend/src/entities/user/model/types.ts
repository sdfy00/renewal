export interface SpaceRole {
  spaceId: string;
  spaceSlug: string;
  role: 'initiator' | 'approver';
}

export interface AuthUser {
  id: string;
  username: string;
  spaceRoles: SpaceRole[];
}
