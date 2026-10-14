/** Values being edited, shown on a profile card in place of the saved ones (m2b-plan.md task 7). Images are URLs. */
export interface ProfilePreview {
  displayName: string;
  pronouns: string;
  avatar: string;
  banner: string | null;
  bio: string;
  statusText: string;
}
