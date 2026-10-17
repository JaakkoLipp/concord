/**
 * Settings as a modal over the mounted shell (m4.6-plan.md task 16a). Opening pushes the settings URL as shallow
 * state, so the shell, a call and the conversation stay mounted under it, and Back closes it. The three settings
 * routes reopen it over a channel after a reload or from a link. SettingsHost, in the channels layout, draws it.
 *
 * A section of user settings is a name in USER_SECTIONS and a branch in Settings.svelte, nothing more.
 */
import { goto, pushState, replaceState } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { onDestroy, tick } from 'svelte';
import type { Store } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { firstChannel, recalled } from '$lib/view/channels.ts';
import { confirm, type Question } from '$lib/view/confirm.svelte.ts';
import { lastPlace } from '$lib/view/places.ts';
import { popout } from '$lib/view/popout.svelte.ts';

export const USER_SECTIONS = ['account', 'profile', 'notifications', 'voice'] as const;
export type UserSection = (typeof USER_SECTIONS)[number];
/** A user settings section from a URL, Profile when it names none we have. */
export const userSection = (s: string | undefined): UserSection => USER_SECTIONS.find((x) => x === s) ?? 'profile';

export type SettingsTarget =
  | { kind: 'user'; section: string }
  | { kind: 'server'; server: string; section: string }
  | { kind: 'channel'; channel: string; section: string };

/** The settings URLs are the same as before the modal, so links and reloads keep working. */
export function settingsUrl(t: SettingsTarget): string {
  if (t.kind === 'user') return resolve('/(app)/app/settings/[section]', { section: t.section });
  if (t.kind === 'server') return resolve('/(app)/app/server-settings/[server]/[section]', { server: t.server, section: t.section });
  return resolve('/(app)/app/channel-settings/[channel]/[section]', { channel: t.channel, section: t.section });
}

interface Guard { dirty: () => boolean; reset: () => void; question: Question }

/** The element to give focus back to: a menu item goes with its menu, so the button that opened the menu. */
function openerOf(): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!active?.closest('[role="menu"]')) return active;
  return [...document.querySelectorAll<HTMLElement>('[aria-haspopup="menu"][aria-expanded="true"]')].find((b) => !b.closest('[role="menu"]')) ?? null;
}

/** A shallow history entry for settings, pushed or in place of the current one. */
function entry(how: 'push' | 'replace', target: SettingsTarget): void {
  const url = settingsUrl(target);
  const state = { ...page.state, settings: target };
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- settingsUrl() resolves
  if (how === 'push') pushState(url, state);
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- settingsUrl() resolves
  else replaceState(url, state);
}

class SettingsModal {
  /**
   * What the modal shows. It follows page.state, except while a Back with unsaved changes waits for an answer.
   * Raw, not a proxy, since it goes back into history state, which must be cloneable.
   */
  shown = $state.raw<SettingsTarget | null>(null);
  /** A SettingsHost is mounted, so a shallow push has something to draw it. */
  hosted = false;
  private opener: HTMLElement | null = null;
  private readonly guards = new Set<Guard>();

  /** Opens settings over the app, or switches to another page of it when open. */
  open(target: SettingsTarget): void {
    // Outside the channels layout nothing draws it: the settings route reopens it over a channel.
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- settingsUrl() resolves
    if (!this.hosted) return void goto(settingsUrl(target));
    if (page.state.settings) return entry('replace', target);
    this.opener = openerOf();
    entry('push', target);
  }

  /** Another section, asking first if the one open has unsaved changes. It replaces this history entry, so Back still closes. */
  async go(target: SettingsTarget): Promise<void> {
    if (!(await this.leave())) return;
    if (page.state.settings) entry('replace', target);
  }

  /** The close button and Esc: the same as Back, asking first about unsaved changes. */
  async close(): Promise<void> {
    if (!this.shown || !(await this.leave())) return;
    history.back();
  }

  /**
   * SettingsHost calls this whenever page.state changes. A shallow Back can't be cancelled and skips
   * beforeNavigate, so with unsaved changes the modal pushes its entry again and asks.
   */
  follow(wanted: SettingsTarget | undefined): void {
    if (wanted) {
      if (!this.shown) popout.close();
      this.shown = wanted;
      return;
    }
    const was = this.shown;
    if (!was) return;
    const dirty = this.dirty();
    if (dirty && this.hosted) {
      entry('push', was);
      void this.ask(dirty).then((ok) => { if (ok) history.back(); });
      return;
    }
    this.shown = null;
    const back = this.opener;
    this.opener = null;
    // After the shell stops being inert, or focus can't land in it.
    void tick().then(() => { if (back?.isConnected) back.focus(); });
  }

  /** Log out from settings: the modal goes at once, before the account its pages read is gone. */
  async dismiss(): Promise<void> {
    this.shown = null;
    this.opener = null;
    await tick();
  }

  /** The channels layout is going, on sign-out or another route: nothing is shown or waiting any more. */
  detach(): void {
    this.hosted = false;
    this.shown = null;
    this.opener = null;
  }

  /** Editors with unsaved changes register here, during component setup, and leave when destroyed. */
  guard(g: Guard): void {
    this.guards.add(g);
    onDestroy(() => this.guards.delete(g));
  }

  private dirty(): Guard | undefined {
    for (const g of this.guards) if (g.dirty()) return g;
    return undefined;
  }

  private async leave(): Promise<boolean> {
    const g = this.dirty();
    return !g || this.ask(g);
  }

  private async ask(g: Guard): Promise<boolean> {
    const ok = await confirm.ask({ ...g.question, danger: true });
    if (ok) for (const x of this.guards) if (x.dirty()) x.reset();
    return ok;
  }
}

export const settingsModal = new SettingsModal();
export const openSettings = (target: SettingsTarget) => settingsModal.open(target);

/**
 * The channel a reloaded or linked settings URL opens over: the last one, or for server and channel settings one
 * in that server. Undefined until the store has loaded enough to say.
 */
function channelUnder(store: Store, t: SettingsTarget): string | undefined {
  if (t.kind === 'user') return lastPlace();
  if (store.connection !== 'ready') return undefined;
  const c = t.kind === 'channel' ? store.channels.get(t.channel) : undefined;
  const server = t.kind === 'server' ? t.server : c?.kind === 'text' ? c.server : undefined;
  const channel = server && store.servers.has(server) ? (recalled(server) ?? firstChannel(store, server)) : undefined;
  return server && channel ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel }) : lastPlace();
}

/**
 * For the three settings routes: replaces the settings URL with a channel, then opens settings over it, so Back
 * closes settings and stays in the app. Returns false while the store isn't ready to choose the channel.
 */
export function reopen(store: Store, target: SettingsTarget): boolean {
  const under = channelUnder(store, target);
  if (!under) return false;
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- channelUnder() resolves
  void goto(under, { replaceState: true }).then(() => openSettings(target));
  return true;
}

/** Unsaved-changes questions for editors that don't bring their own. */
export const unsavedQuestion = (): Question => ({ title: m.admin.leaveUnsavedTitle, body: m.admin.leaveUnsavedBody, confirm: m.admin.leaveUnsaved });
