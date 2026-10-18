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

/** A member's request for an invite to a server; its code arrives once an admin approves, or at once for a moderator. */
export interface ServerInviteRequest {
  id: string;
  requestedBy: Id;
  server: Id;
  note: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'declined';
  code: string | null;
}

/** Why something was reported (m4.7-plan.md task 9). */
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'other';

/**
 * A report, as a server's moderators or the app's admins see it. `content` is the reported message's text as it was,
 * kept as evidence until 90 days after the report closes. A report of a DM message or a user has no server.
 */
export interface Report {
  id: string;
  kind: 'message' | 'user';
  server: Id | null;
  channel: Id | null;
  message: Id | null;
  reported: Id;
  reporter: Id;
  content: string | null;
  reason: ReportReason;
  notes: string;
  createdAt: number;
  status: 'open' | 'closed';
  closedBy: Id | null;
  closedAt: number | null;
  closeNote: string | null;
}

/** Where reports are read: a server's moderators, with Manage messages, or the app's admins. */
export type ReportScope = { server: Id } | 'admin';

export type ReportTarget = { kind: 'message'; channel: Id; message: Id } | { kind: 'user'; user: Id };

/** Product feedback and bug reports, visible only to the app's admins. */
export interface Feedback {
  id: string;
  reporter: Id;
  kind: 'bug' | 'feedback';
  title: string;
  description: string;
  createdAt: number;
  status: 'open' | 'closed';
  closedBy: Id | null;
  closedAt: number | null;
}

/** What the admin view may ask the account runner to do to a person (architecture section 11.5). */
export type AccountAction = 'moderator:add' | 'moderator:remove' | 'admin:add' | 'admin:remove' | 'password-link' | 'suspend' | 'unsuspend';

/** A person on the platform as the runner last listed them. The owner is the first admin, and can't be demoted. */
export interface PlatformUser {
  id: Id;
  username: string;
  discriminator: string;
  displayName?: string;
  disabled: boolean;
  admin: boolean;
  moderator: boolean;
  owner: boolean;
}

/** The runner's answer to an action. A password link is shown once, to the admin who asked. */
export interface AccountActionResult {
  status: 'pending' | 'ok' | 'failed';
  message?: string;
  link?: string;
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
  /** The caller's own server-invite requests; an admin sees every recent one when `review` is set. */
  serverInvites(review?: boolean): Promise<ServerInviteRequest[]>;
  /** Ask for an invite to a server. A moderator or admin passes the code of an invite they made, and skips review. */
  requestServerInvite(server: Id, note: string, code?: string): Promise<ServerInviteRequest>;
  /** Approve (with the code of an invite the admin made in that server) or decline a pending request. Admin only. */
  reviewServerInvite(id: string, action: 'approve' | 'decline', code?: string): Promise<void>;
  /** Everyone on the platform, for the admin view. Admin only; fails with 503 while the account runner is down. */
  platformUsers(): Promise<{ users: PlatformUser[]; updatedAt: number }>;
  /** Ask the account runner to do one thing to a person. Returns the request to ask about. Admin only. */
  accountAction(action: AccountAction, user: Id): Promise<{ id: string }>;
  /** The runner's answer to a request, pending until it has one. */
  accountActionResult(id: string): Promise<AccountActionResult>;
  /** The tags these users wear, by user. */
  wornTags(users: Id[]): Promise<Record<Id, ServerTag>>;
  /** These servers' tags, by server. */
  serverTags(servers: Id[]): Promise<Record<Id, ServerTag>>;
  setServerTag(server: Id, tag: string, emoji: Id): Promise<ServerTag>;
  removeServerTag(server: Id): Promise<void>;
  /** Wear a server's tag, or none. */
  wearTag(server: Id | null): Promise<void>;
  /** Report a message or a user, with a reason and optional notes. 10 an hour each. */
  report(target: ReportTarget, reason: ReportReason, notes: string): Promise<void>;
  /** Open reports in a scope, and closed ones too when asked. */
  reports(scope: ReportScope, includeClosed?: boolean): Promise<Report[]>;
  /** How many reports wait in a scope. */
  reportCount(scope: ReportScope): Promise<number>;
  /** Close a report with a note; it doesn't act by itself. */
  closeReport(id: string, note: string): Promise<void>;
  submitFeedback(kind: Feedback['kind'], title: string, description: string): Promise<void>;
  feedback(includeClosed?: boolean): Promise<Feedback[]>;
  closeFeedback(id: string): Promise<void>;
}
