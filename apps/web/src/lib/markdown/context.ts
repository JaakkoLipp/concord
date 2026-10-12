/** What markdown needs to resolve mentions: the store and the server the message belongs to. */
import { getContext, setContext } from 'svelte';
import type { Store } from '@concord/domain';

export interface MarkdownContext { store: Store; server: string | undefined }
const KEY = Symbol('markdown');
export const setMarkdownContext = (ctx: () => MarkdownContext) => setContext(KEY, ctx);
export const markdownContext = () => getContext<() => MarkdownContext>(KEY)();
