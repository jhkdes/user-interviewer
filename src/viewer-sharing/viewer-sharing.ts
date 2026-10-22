import type { EmailClient } from "@/lib/email";
import type { PmRoleStore } from "@/pm-auth";
import type { StudyRepository } from "@/repositories/study-repository";
import { renderInviteEmail } from "./render-invite-email";

/** A dashboard login account, as far as sharing cares. */
export interface ViewerAccount {
  id: string;
  email: string;
  /** False until the person has opened their invite link; true after. */
  accepted: boolean;
}

/** The slice of Supabase Auth's admin API that sharing uses. */
export interface ViewerAuthAdmin {
  findByEmail(email: string): Promise<ViewerAccount | null>;
  getByIds(ids: string[]): Promise<ViewerAccount[]>;
  /** Creates the account if it does not exist yet, and returns a single-use token for its invite link. Works again for an account that has not accepted yet. */
  createInvite(email: string): Promise<{ account: ViewerAccount; tokenHash: string }>;
  /** Deletes the account; its role and study grants go with it. */
  deleteUser(userId: string): Promise<void>;
}

/** Roles and study grants, read and written. */
export interface ViewerGrantStore extends PmRoleStore {
  /** Gives the user the viewer role unless they already have a role (never changes an admin). */
  ensureViewerRole(userId: string): Promise<void>;
  addGrants(userId: string, studyIds: string[]): Promise<void>;
  removeGrant(userId: string, studyId: string): Promise<void>;
  listGrantedUserIds(studyId: string): Promise<string[]>;
}

export interface ViewerSharingDeps {
  auth: ViewerAuthAdmin;
  store: ViewerGrantStore;
  studyRepo: StudyRepository;
  emailClient: EmailClient;
}

export class InvalidEmailError extends Error {
  constructor(email: string) {
    super(`"${email}" is not a valid email address`);
    this.name = "InvalidEmailError";
  }
}

export class ViewerStudyNotFoundError extends Error {
  constructor(studyId: string) {
    super(`No study found for id: ${studyId}`);
    this.name = "ViewerStudyNotFoundError";
  }
}

export class AlreadyAdminError extends Error {
  constructor(email: string) {
    super(`${email} is an admin and already has full access`);
    this.name = "AlreadyAdminError";
  }
}

export class NotAViewerError extends Error {
  constructor() {
    super("That account is not a viewer");
    this.name = "NotAViewerError";
  }
}

export class InviteAlreadyAcceptedError extends Error {
  constructor(email: string) {
    super(`${email} has already accepted their invite`);
    this.name = "InviteAlreadyAcceptedError";
  }
}

/** The grant and account are saved, but the invite email did not go out; it can be sent again. */
export class InviteEmailError extends Error {
  constructor(email: string, cause: unknown) {
    super(`Access was set up for ${email}, but the invite email could not be sent. Try Resend.`);
    this.name = "InviteEmailError";
    this.cause = cause;
  }
}

export type InviteOutcome =
  /** A new account was created and an invite emailed. */
  | "invited"
  /** The person had been invited before and not accepted; a fresh invite was emailed. */
  | "invite-resent"
  /** The person already has an active account; the study was added and nothing was emailed. */
  | "access-added";

export interface InviteViewerInput {
  email: string;
  studyIds: string[];
  /** The site's origin, for the link in the email (for example "https://app.example.com"). */
  origin: string;
}

export interface InviteViewerResult {
  userId: string;
  email: string;
  outcome: InviteOutcome;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function acceptUrl(origin: string, tokenHash: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/accept-invite?token_hash=${encodeURIComponent(tokenHash)}`;
}

async function sendInvite(
  deps: ViewerSharingDeps,
  account: ViewerAccount,
  studyIds: string[],
  origin: string,
): Promise<void> {
  const { tokenHash } = await deps.auth.createInvite(account.email);
  const studies = await Promise.all(studyIds.map((id) => deps.studyRepo.getById(id)));
  const titles = studies.flatMap((s) => (s ? [s.title || "(untitled study)"] : []));
  const { subject, html } = renderInviteEmail({
    studyTitles: titles,
    acceptUrl: acceptUrl(origin, tokenHash),
  });
  try {
    await deps.emailClient.send({ to: account.email, subject, html });
  } catch (err) {
    throw new InviteEmailError(account.email, err);
  }
}

/**
 * Gives a person read-only access to the studies, inviting them by email if
 * they have no account yet. The grants are saved before the email is sent and
 * stay in place if it fails; nobody can use them until the person has
 * accepted the invite and set a password.
 */
export async function inviteViewer(
  deps: ViewerSharingDeps,
  input: InviteViewerInput,
): Promise<InviteViewerResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new InvalidEmailError(input.email);

  for (const studyId of input.studyIds) {
    if (!(await deps.studyRepo.getById(studyId))) throw new ViewerStudyNotFoundError(studyId);
  }

  const existing = await deps.auth.findByEmail(email);
  if (existing) {
    if ((await deps.store.getRole(existing.id)) === "admin") throw new AlreadyAdminError(email);
    await deps.store.ensureViewerRole(existing.id);
    await deps.store.addGrants(existing.id, input.studyIds);

    if (existing.accepted) return { userId: existing.id, email, outcome: "access-added" };
    // The email lists everything they can read, not only what was just added.
    await sendInvite(
      deps,
      existing,
      await deps.store.listGrantedStudyIds(existing.id),
      input.origin,
    );
    return { userId: existing.id, email, outcome: "invite-resent" };
  }

  const { account } = await deps.auth.createInvite(email);
  await deps.store.ensureViewerRole(account.id);
  await deps.store.addGrants(account.id, input.studyIds);
  await sendInvite(deps, account, input.studyIds, input.origin);
  return { userId: account.id, email, outcome: "invited" };
}

export interface StudyViewer {
  userId: string;
  email: string;
  status: "invited" | "active";
}

/** Everyone with access to the study, by email. */
export async function listStudyViewers(
  deps: Pick<ViewerSharingDeps, "auth" | "store">,
  studyId: string,
): Promise<StudyViewer[]> {
  const accounts = await deps.auth.getByIds(await deps.store.listGrantedUserIds(studyId));
  return accounts
    .map((a) => ({
      userId: a.id,
      email: a.email,
      status: a.accepted ? ("active" as const) : ("invited" as const),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Takes one study away from a viewer. Their other studies and their account stay. */
export async function revokeViewerFromStudy(
  deps: Pick<ViewerSharingDeps, "store">,
  userId: string,
  studyId: string,
): Promise<void> {
  if ((await deps.store.getRole(userId)) !== "viewer") throw new NotAViewerError();
  await deps.store.removeGrant(userId, studyId);
}

/** Deletes a viewer's account, which ends their access to every study. Refuses anyone who is not a viewer. */
export async function removeViewerAccount(
  deps: Pick<ViewerSharingDeps, "auth" | "store">,
  userId: string,
): Promise<void> {
  if ((await deps.store.getRole(userId)) !== "viewer") throw new NotAViewerError();
  await deps.auth.deleteUser(userId);
}

/** Emails a fresh invite to a viewer who has not accepted yet. */
export async function resendInvite(
  deps: ViewerSharingDeps,
  userId: string,
  studyId: string,
  origin: string,
): Promise<void> {
  if ((await deps.store.getRole(userId)) !== "viewer") throw new NotAViewerError();

  const granted = await deps.store.listGrantedStudyIds(userId);
  if (!granted.includes(studyId)) throw new NotAViewerError();

  const [account] = await deps.auth.getByIds([userId]);
  if (!account) throw new NotAViewerError();
  if (account.accepted) throw new InviteAlreadyAcceptedError(account.email);

  await sendInvite(deps, account, granted, origin);
}
