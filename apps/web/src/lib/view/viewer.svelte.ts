/** The full-screen image viewer (client.md section 6.2), one for the whole app. */
export interface Viewed { src: string; alt: string; width?: number | undefined; height?: number | undefined; original?: string | undefined }

class Viewer {
  current = $state<Viewed | null>(null);
  open(v: Viewed) { this.current = v; }
  close() { this.current = null; }
}

export const viewer = new Viewer();
