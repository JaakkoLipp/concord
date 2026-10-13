/**
 * The composer's editor: CodeMirror 6 holding Stoat-syntax text, with tokens drawn as atomic widgets
 * (m2a-plan.md decision 1). Loaded lazily by Composer.svelte, so CodeMirror stays out of the initial bundle.
 */
import { Compartment, EditorState } from '@codemirror/state';
import {
  Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType, keymap, placeholder,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';
import { drafts } from './drafts.ts';
import { TOKEN, tokenAt, type TokenKind } from './text.ts';

/** How a token looks: a pill with text, or an image for custom emoji. */
export type TokenLook = { text: string; colour?: string | undefined; self?: boolean } | { image: string; alt: string };
export type Labeller = (kind: TokenKind, id: string) => TokenLook;

export interface ComposerEditor {
  text(): string;
  /** Empty the editor after a send, with a fresh undo history. */
  clear(): void;
  /** Keep the current draft and open another channel's, or an empty one. */
  switchTo(draft: string): void;
  setPlaceholder(text: string): void;
  /** Put text at the caret, replacing any selection, such as an emoji from the picker. */
  insert(text: string): void;
  focus(): void;
  /** Keeps the current draft. */
  destroy(): void;
}

export interface EditorOptions {
  /** The draft to open and keep, or null for an editor without drafts, such as an inline edit. */
  draft: string | null;
  /** Starting text when there is no draft. */
  text?: string;
  placeholder: string;
  /** On touch screens Enter adds a line and a button sends, as on Discord's phone app. */
  touch: boolean;
  label: Labeller;
  onChange(text: string): void;
  onSend(): void;
  /** Returns whether Escape was used, such as to cancel a reply. */
  onEscape(): boolean;
  /** Up arrow in an empty editor, to edit the last message. Returns whether it was used. */
  onArrowUp?(): boolean;
}

class TokenWidget extends WidgetType {
  readonly kind: TokenKind;
  readonly id: string;
  readonly look: TokenLook;
  constructor(kind: TokenKind, id: string, look: TokenLook) {
    super();
    this.kind = kind;
    this.id = id;
    this.look = look;
  }

  override eq(other: TokenWidget): boolean {
    return other.kind === this.kind && other.id === this.id && JSON.stringify(other.look) === JSON.stringify(this.look);
  }

  toDOM(): HTMLElement {
    if ('image' in this.look) {
      const img = document.createElement('img');
      img.className = 'cm-token-emoji';
      img.src = this.look.image;
      img.alt = this.look.alt;
      img.title = this.look.alt;
      img.draggable = false;
      return img;
    }
    const span = document.createElement('span');
    span.className = `cm-token cm-token-${this.kind}${this.look.self ? ' cm-token-self' : ''}`;
    span.textContent = this.look.text;
    if (this.look.colour) span.style.setProperty('--role', this.look.colour);
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function tokens(label: Labeller) {
  const decorator = new MatchDecorator({
    regexp: new RegExp(TOKEN.source, 'g'),
    decoration: (match) => {
      const { kind, id } = tokenAt(match);
      return Decoration.replace({ widget: new TokenWidget(kind, id, label(kind, id)) });
    },
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = decorator.updateDeco(u, this.decorations);
      }
    },
    {
      decorations: (v) => v.decorations,
      // Atomic: the caret steps over a token, and Backspace deletes it whole.
      provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
    },
  );
}

const theme = EditorView.theme({
  '&': { color: 'var(--text-normal)', font: 'var(--text-md) var(--font-sans)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-sans)', lineHeight: '1.375rem', maxHeight: '50vh', overflowY: 'auto' },
  '.cm-content': { padding: 'var(--space-4) 0', caretColor: 'var(--text-strong)' },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'var(--text-muted)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': { background: 'var(--accent-subtle)' },
  '.cm-cursor': { borderLeftColor: 'var(--text-strong)' },
});

export function createEditor(parent: HTMLElement, opts: EditorOptions): ComposerEditor {
  const hint = new Compartment();
  const attributes = (text: string) => [
    placeholder(text),
    EditorView.contentAttributes.of({
      'aria-label': text,
      'aria-multiline': 'true',
      enterkeyhint: opts.touch ? 'enter' : 'send',
    }),
  ];
  const send = (view: EditorView) => {
    // An IME confirming a candidate also presses Enter (client.md section 6.3).
    if (view.composing) return false;
    opts.onSend();
    return true;
  };

  let placeholderText = opts.placeholder;
  const extensions = () => [
    history(),
    keymap.of([
      { key: 'Enter', run: opts.touch ? insertNewline : send },
      { key: 'Shift-Enter', run: insertNewline },
      { key: 'Escape', run: () => opts.onEscape() },
      { key: 'ArrowUp', run: (v) => v.state.doc.length === 0 && !!opts.onArrowUp?.() },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.lineWrapping,
    hint.of(attributes(placeholderText)),
    tokens(opts.label),
    theme,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange(u.state.doc.toString());
    }),
  ];
  const fresh = (doc = '', caret = 0) => EditorState.create({ doc, selection: { anchor: Math.min(caret, doc.length) }, extensions: extensions() });
  const saved = (draft: string | null) => {
    const d = draft === null ? undefined : drafts.get(draft);
    return d ? fresh(d.text, d.caret) : fresh(opts.text ?? '', (opts.text ?? '').length);
  };

  let current = opts.draft;
  const view = new EditorView({ parent, state: saved(current) });
  const keep = () => {
    if (current === null) return;
    if (view.state.doc.length) drafts.set(current, { text: view.state.doc.toString(), caret: view.state.selection.main.head });
    else drafts.delete(current);
  };

  return {
    text: () => view.state.doc.toString(),
    clear: () => {
      view.setState(fresh());
      if (current !== null) drafts.delete(current);
      opts.onChange('');
    },
    switchTo: (draft) => {
      if (draft === current) return;
      keep();
      current = draft;
      view.setState(saved(draft));
      opts.onChange(view.state.doc.toString());
    },
    setPlaceholder: (text) => {
      placeholderText = text;
      view.dispatch({ effects: hint.reconfigure(attributes(text)) });
    },
    insert: (text) => {
      const r = view.state.selection.main;
      view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length }, scrollIntoView: true });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => {
      keep();
      view.destroy();
    },
  };
}
