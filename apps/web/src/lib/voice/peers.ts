/**
 * Who else is in the call, for the join and leave sounds (client.md section 10.2). A full LiveKit restart
 * tears every participant down and announces them again, so the sounds compare who was there before the
 * outage with who is there after it, and only real differences make a sound.
 */
export class Peers {
  private readonly present = new Set<string>();

  /** Those already in the room when the call connects make no sound. */
  seed(ids: Iterable<string>): void {
    for (const id of ids) this.present.add(id);
  }

  /** Someone appeared. True when that is worth a sound: someone new, while the call is up. */
  joined(id: string, live: boolean): boolean {
    if (this.present.has(id)) return false;
    this.present.add(id);
    return live;
  }

  /** Someone went. While the call itself is down, they are kept: a restart will announce them again. */
  left(id: string, live: boolean): boolean {
    if (!live) return false;
    return this.present.delete(id);
  }

  /** After a reconnect: drop, silently, whoever didn't come back. */
  reconcile(ids: Iterable<string>): void {
    const now = new Set(ids);
    for (const id of this.present) if (!now.has(id)) this.present.delete(id);
  }
}
