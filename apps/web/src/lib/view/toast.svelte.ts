/** Short notices, such as a failed edit being reverted (client.md section 4.3). Each disappears on its own. */
export interface Toast { id: number; text: string; tone: 'info' | 'error' }

class Toasts {
  list = $state<Toast[]>([]);
  private next = 1;

  show(text: string, tone: Toast['tone'] = 'error'): void {
    const id = this.next++;
    this.list = [...this.list.slice(-2), { id, text, tone }];
    setTimeout(() => this.dismiss(id), 5_000);
  }

  dismiss(id: number): void {
    this.list = this.list.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
