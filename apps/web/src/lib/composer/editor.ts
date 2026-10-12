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
import { TOKEN, tokenAt, type TokenKind } from './text.ts';

/** How a token looks: a pill with text, or an image for custom emoji. */
export type TokenLook = { text: string; colour?: string | undefined; self?: boolean } | { image: string; alt: string };
export type Labeller = (kind: TokenKind, id: string) => TokenLook;

export interface ComposerEditor {
  text(): string;
  setText(text: string): void;
  setPlaceholder(text: string): void;
  focus(): void;
  destroy(): void;
}

export interface EditorOptions {
  text: string;
  placeholder: string;
  /** On touch screens Enter adds a line and a button sends, as on Discord's phone app. */
  touch: boolean;
  label: Labeller;
  onChange(text: string): void;
  onSend(): void;
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

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.text,
      extensions: [
        history(),
        keymap.of([
          { key: 'Enter', run: opts.touch ? insertNewline : send },
          { key: 'Shift-Enter', run: insertNewline },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.lineWrapping,
        hint.of(attributes(opts.placeholder)),
        tokens(opts.label),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opts.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    text: () => view.state.doc.toString(),
    setText: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
    },
    setPlaceholder: (text) => view.dispatch({ effects: hint.reconfigure(attributes(text)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
