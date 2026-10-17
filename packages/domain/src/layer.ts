/**
 * Concord's own layer (architecture section 11), as Backend is for Stoat: what Concord keeps that Stoat has no
 * place for. Implementations throw BackendError for every refusal, and sign out only on the layer's own 401.
 */
import type { Id } from './entities.ts';

/** Our own gates, beside Stoat's permissions. */
export interface LayerGates {
  /** On ADMIN_USER_IDS, for the admin panel. */
  admin: boolean;
  /** On Stoat's server-creator list. */
  serverCreator: boolean;
}

export interface LayerMe {
  id: Id;
  gates: LayerGates;
}

export interface BetaInvitation {
  id: string;
  email: string;
  requestedBy: Id;
  createdAt: number;
  status: 'pending' | 'approved' | 'declined' | 'claiming' | 'used' | 'failed';
  expiresAt: number | null;
}

/** A server's tag (m4.5-plan.md task 10): up to 4 letters or digits, with one of its custom emoji as the badge. */
export interface ServerTag {
  server: Id;
  tag: string;
  emoji: Id;
}

export interface Layer {
  me(): Promise<LayerMe>;
  /** The caller's own invitations; an admin sees every recent one when `review` is set. */
  betaInvitations(review?: boolean): Promise<BetaInvitation[]>;
  /** Ask for an invitation to the closed beta for a friend's address; admins and moderators get it approved at once. */
  requestBetaInvitation(email: string): Promise<BetaInvitation>;
  /** Approve or decline a pending request. Admin only. */
  reviewBetaInvitation(id: string, action: 'approve' | 'decline'): Promise<void>;
  /** A fresh invite link for an approved invitation; it invalidates the previous link. */
  betaInvitationLink(id: string): Promise<{ token: string }>;
  /** The tags these users wear, by user. */
  wornTags(users: Id[]): Promise<Record<Id, ServerTag>>;
  /** These servers' tags, by server. */
  serverTags(servers: Id[]): Promise<Record<Id, ServerTag>>;
  setServerTag(server: Id, tag: string, emoji: Id): Promise<ServerTag>;
  removeServerTag(server: Id): Promise<void>;
  /** Wear a server's tag, or none. */
  wearTag(server: Id | null): Promise<void>;
}
