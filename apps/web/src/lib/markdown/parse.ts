/**
 * Our markdown parser (client.md section 6.2): CommonMark-style blocks with GitHub tables, strikethrough and
 * autolinks, single newlines as line breaks, and Stoat's extensions from architecture section 4.4. It builds a
 * small tree that Svelte components render; nothing is ever turned into HTML.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em' | 'strike' | 'spoiler'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'user' | 'role' | 'channel' | 'emoji'; id: string }
  | { t: 'unicode'; v: string }
  | { t: 'mass'; v: 'everyone' | 'online' }
  | { t: 'time'; unix: number; style: TimeStyle }
  | { t: 'math'; v: string }
  | { t: 'br' };

export type TimeStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'table'; align: ('left' | 'center' | 'right' | null)[]; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' }
  | { t: 'math'; v: string };

const ULID = '[0-9A-HJKMNP-TV-Z]{26}';
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Parse a whole message. */
export function parse(source: string): Block[] {
  return blocks(source.replace(/\r\n?/g, '\n').split('\n'), 0);
}

function blocks(lines: string[], depth: number): Block[] {
  const out: Block[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', c: inline(para.join('\n')) });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(lines[i]!)) body.push(lines[i++]!);
      i++;
      out.push({ t: 'code', lang: fence[2]!.toLowerCase(), v: body.join('\n') });
      continue;
    }
    if (line.trim() === '$$') {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== '$$') body.push(lines[i++]!);
      i++;
      out.push({ t: 'math', v: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      out.push({ t: 'h', level: heading[1]!.length as 1, c: inline(heading[2]!) });
      i++;
      continue;
    }
    if (HR.test(line) && !para.length) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line) && depth < 8) {
      flush();
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) body.push(QUOTE.exec(lines[i++]!)![1]!);
      out.push({ t: 'quote', c: blocks(body, depth + 1) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item && depth < 8 && (!para.length || /^[-*+]$/.test(item[2]!) || item[2]!.startsWith('1'))) {
      flush();
      const [list, next] = listAt(lines, i, depth);
      out.push(list);
      i = next;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]!).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rows.push(cells(lines[i++]!).map(inline));
      out.push({ t: 'table', align, head: head.map(inline), rows });
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return out;
}

function listAt(lines: string[], start: number, depth: number): [Block, number] {
  const first = LIST_ITEM.exec(lines[start]!)!;
  const indent = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: Block[][] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]!);
    if (!m || m[1]!.length !== indent || /\d/.test(m[2]!) !== ordered) break;
    const contentIndent = indent + m[2]!.length + 1;
    const body = [m[3]!];
    i++;
    while (i < lines.length) {
      const l = lines[i]!;
      if (!l.trim()) {
        // A blank line ends the list unless the next line is indented into this item.
        const nextLine = lines[i + 1];
        if (nextLine !== undefined && /^\s+/.test(nextLine) && nextLine.search(/\S/) >= contentIndent) {
          body.push('');
          i++;
          continue;
        }
        break;
      }
      const lead = l.search(/\S/);
      if (lead >= Math.min(contentIndent, indent + 2)) {
        body.push(l.slice(Math.min(lead, contentIndent)));
        i++;
        continue;
      }
      if (LIST_ITEM.test(l)) break;
      // A lazy continuation line belongs to the item's paragraph.
      if (lead <= indent && !LIST_ITEM.test(l) && !QUOTE.test(l) && !HEADING.test(l)) {
        body.push(l.trim());
        i++;
        continue;
      }
      break;
    }
    items.push(blocks(body, depth + 1));
  }
  return [{ t: 'list', ordered, start: ordered ? parseInt(first[2]!, 10) : 1, items }, i];
}

function cells(row: string): string[] {
  let r = row.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|') && !r.endsWith('\\|')) r = r.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < r.length; i++) {
    if (r[i] === '\\' && r[i + 1] === '|') { cur += '|'; i++; continue; }
    if (r[i] === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += r[i];
  }
  out.push(cur.trim());
  return out;
}

// ---------- inline ----------

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~<>:$@]/;
const MENTION = new RegExp(`^<([@%#])(${ULID})>`);
const TIME = /^<t:(-?\d{1,13})(?::([tTdDfFR]))?>/;
const EMOJI = new RegExp(`^:(${ULID}):`);
const AUTOLINK = /^https?:\/\/[^\s<]*[^\s<.,:;"')\]!?*_~|]/;
const ANGLE_LINK = /^<(https?:\/\/[^\s<>]+)>/;
const MASS = /^@(everyone|online)\b/;
const UNICODE = /\p{RGI_Emoji}/v;

export function inline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const push = (node: Inline) => {
    if (text) out.push(...emojify(text));
    text = '';
    out.push(node);
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i]!;

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.test(src[i + 1]!)) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      push({ t: 'br' });
      i++;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(rest)![0];
      const end = src.indexOf(run, i + run.length);
      if (end > 0 && src[end + run.length] !== '`') {
        let v = src.slice(i + run.length, end);
        if (v.length > 2 && v.startsWith(' ') && v.endsWith(' ')) v = v.slice(1, -1);
        push({ t: 'code', v: v.replace(/\n/g, ' ') });
        i = end + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }
    if (rest.startsWith('$$')) {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 2) {
        push({ t: 'math', v: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '<') {
      const mention = MENTION.exec(rest);
      if (mention) {
        push({ t: mention[1] === '@' ? 'user' : mention[1] === '%' ? 'role' : 'channel', id: mention[2]! });
        i += mention[0].length;
        continue;
      }
      const time = TIME.exec(rest);
      if (time) {
        push({ t: 'time', unix: Number(time[1]), style: (time[2] ?? 'f') as TimeStyle });
        i += time[0].length;
        continue;
      }
      const link = ANGLE_LINK.exec(rest);
      if (link) {
        push({ t: 'link', href: link[1]!, c: [{ t: 'text', v: link[1]! }] });
        i += link[0].length;
        continue;
      }
    }
    if (ch === ':') {
      const emoji = EMOJI.exec(rest);
      if (emoji) {
        push({ t: 'emoji', id: emoji[1]! });
        i += emoji[0].length;
        continue;
      }
    }
    if (ch === '@' && (i === 0 || /\W/.test(src[i - 1]!))) {
      const mass = MASS.exec(rest);
      if (mass) {
        push({ t: 'mass', v: mass[1] as 'everyone' | 'online' });
        i += mass[0].length;
        continue;
      }
    }
    if (ch === 'h' && (i === 0 || /[\s(]/.test(src[i - 1]!))) {
      const auto = AUTOLINK.exec(rest);
      if (auto) {
        push({ t: 'link', href: auto[0], c: [{ t: 'text', v: auto[0] }] });
        i += auto[0].length;
        continue;
      }
    }
    if (ch === '[' && depth < 6) {
      const link = linkAt(src, i, depth);
      if (link) {
        push(link.node);
        i = link.end;
        continue;
      }
    }
    if (depth < 12) {
      const span = delimited(src, i, depth);
      if (span) {
        push(span.node);
        i = span.end;
        continue;
      }
    }
    text += ch;
    i++;
  }
  if (text) out.push(...emojify(text));
  return out;
}

/** `[text](https://…)`. Other schemes stay plain text (client.md section 6.2). */
function linkAt(src: string, i: number, depth: number): { node: Inline; end: number } | null {
  let level = 0;
  let close = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === '[') level++;
    else if (src[j] === ']' && --level === 0) { close = j; break; }
  }
  if (close < 0 || src[close + 1] !== '(') return null;
  const end = src.indexOf(')', close + 2);
  if (end < 0) return null;
  const href = src.slice(close + 2, end).trim().split(/\s+/)[0] ?? '';
  if (!/^https?:\/\//i.test(href)) return null;
  return { node: { t: 'link', href, c: inline(src.slice(i + 1, close), depth + 1) }, end: end + 1 };
}

const DELIMS: [string, 'strong' | 'em' | 'strike' | 'spoiler'][] = [
  ['||', 'spoiler'], ['~~', 'strike'], ['**', 'strong'], ['__', 'strong'], ['*', 'em'], ['_', 'em'],
];

function delimited(src: string, i: number, depth: number): { node: Inline; end: number } | null {
  // ***both*** and ___both___ nest emphasis inside strong.
  for (const triple of ['***', '___']) {
    if (src.startsWith(triple, i) && src[i + 3] && !/\s/.test(src[i + 3]!)) {
      const end = findClose(src, triple, i + 3);
      if (end > 0) return { node: { t: 'strong', c: [{ t: 'em', c: inline(src.slice(i + 3, end), depth + 1) }] }, end: end + 3 };
    }
  }
  for (const [d, t] of DELIMS) {
    if (!src.startsWith(d, i)) continue;
    const after = src[i + d.length];
    // Spoiler bars are not flanking delimiters: `|| a ||` is a spoiler, as on Discord.
    if (!after || (d !== '||' && /\s/.test(after))) continue;
    // Underscores emphasise only at word boundaries, so snake_case stays as typed.
    if (d[0] === '_' && i > 0 && /[\p{L}\p{N}]/u.test(src[i - 1]!)) continue;
    const end = findClose(src, d, i + d.length);
    if (end < 0) continue;
    if (d[0] === '_' && end + d.length < src.length && /[\p{L}\p{N}]/u.test(src[end + d.length]!)) continue;
    return { node: { t, c: inline(src.slice(i + d.length, end), depth + 1) }, end: end + d.length };
  }
  return null;
}

function findClose(src: string, d: string, from: number): number {
  for (let j = from; j < src.length; j++) {
    const c = src[j]!;
    if (c === '\\') { j++; continue; }
    if (c === '`') {
      const run = /^`+/.exec(src.slice(j))![0];
      const end = src.indexOf(run, j + run.length);
      if (end > 0) { j = end + run.length - 1; continue; }
    }
    if (src.startsWith(d, j) && (d === '||' || !/\s/.test(src[j - 1]!))) {
      // A single * must not close on the first half of a **.
      if (d.length === 1 && src[j + 1] === d && src.startsWith(d + d, j)) {
        const inner = findClose(src, d + d, j + 2);
        if (inner > 0) { j = inner + 1; continue; }
      }
      if (j > from) return j;
    }
  }
  return -1;
}

/** Split plain text into text and unicode emoji nodes. */
function emojify(text: string): Inline[] {
  if (!UNICODE.test(text)) return [{ t: 'text', v: text }];
  const out: Inline[] = [];
  const re = new RegExp(UNICODE.source, 'gv');
  let last = 0;
  for (const m of text.matchAll(re)) {
    // Digits, # and * are RGI keycap bases; only their keycap sequences are emoji.
    if (/^[0-9#*]$/.test(m[0])) continue;
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: 'unicode', v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/** True when a message is only emoji, up to 30, which Discord and Stoat show large. */
export function onlyEmoji(blocks: Block[]): boolean {
  const b = blocks[0];
  if (blocks.length !== 1 || b?.t !== 'p') return false;
  const nodes = b.c.filter((n) => !(n.t === 'text' && !n.v.trim()));
  return nodes.length > 0 && nodes.length <= 30 && nodes.every((n) => n.t === 'unicode' || n.t === 'emoji');
}
