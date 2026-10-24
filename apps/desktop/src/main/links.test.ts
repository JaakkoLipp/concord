import { describe, expect, it } from 'vitest';
import { clientUrl, PRODUCTION_URL, route } from './links.ts';

const ORIGIN = 'https://concord.jaalip.com';

describe('clientUrl', () => {
  it('is production in a packaged build, whatever CONCORD_URL says', () => {
    expect(clientUrl(true, 'http://localhost/app').href).toBe(PRODUCTION_URL);
  });
  it('takes CONCORD_URL in an unpackaged build', () => {
    expect(clientUrl(false, 'http://localhost/app').href).toBe('http://localhost/app');
    expect(clientUrl(false, undefined).href).toBe(PRODUCTION_URL);
  });
  it('ignores a CONCORD_URL that is not http or https', () => {
    expect(clientUrl(false, 'file:///etc/passwd').href).toBe(PRODUCTION_URL);
    expect(clientUrl(false, 'javascript:alert(1)').href).toBe(PRODUCTION_URL);
    expect(clientUrl(false, 'not a url').href).toBe(PRODUCTION_URL);
  });
});

describe('route', () => {
  it('keeps the client in the window', () => {
    expect(route(`${ORIGIN}/app`, ORIGIN)).toEqual({ kind: 'app', url: `${ORIGIN}/app` });
    expect(route(`${ORIGIN}/app/channels/@me?x=1#y`, ORIGIN)).toEqual({ kind: 'app', url: `${ORIGIN}/app/channels/@me?x=1#y` });
  });

  it('opens our own invite links on the client invite page', () => {
    expect(route(`${ORIGIN}/invite/AbC123`, ORIGIN)).toEqual({ kind: 'app', url: `${ORIGIN}/app/invite/AbC123` });
    expect(route(`${ORIGIN}/invite/AbC123/`, ORIGIN)).toEqual({ kind: 'app', url: `${ORIGIN}/app/invite/AbC123` });
  });

  it('opens invite-looking paths that are not invite codes in the browser', () => {
    expect(route(`${ORIGIN}/invite/../app`, ORIGIN)).toEqual({ kind: 'app', url: `${ORIGIN}/app` });
    expect(route(`${ORIGIN}/invite/a%2Fb`, ORIGIN).kind).toBe('external');
    expect(route(`${ORIGIN}/invite/${'a'.repeat(33)}`, ORIGIN).kind).toBe('external');
    expect(route(`${ORIGIN}/invite/abc/extra`, ORIGIN).kind).toBe('external');
  });

  it('opens the website and other sites in the browser', () => {
    expect(route(`${ORIGIN}/`, ORIGIN)).toEqual({ kind: 'external', url: `${ORIGIN}/` });
    expect(route(`${ORIGIN}/application`, ORIGIN)).toEqual({ kind: 'external', url: `${ORIGIN}/application` });
    expect(route('https://example.com/app', ORIGIN)).toEqual({ kind: 'external', url: 'https://example.com/app' });
    expect(route('http://example.com/', ORIGIN)).toEqual({ kind: 'external', url: 'http://example.com/' });
    expect(route('mailto:someone@example.com', ORIGIN)).toEqual({ kind: 'external', url: 'mailto:someone@example.com' });
  });

  it('treats a lookalike host or another port or scheme as another site', () => {
    expect(route('https://concord.jaalip.com.example.com/app', ORIGIN).kind).toBe('external');
    expect(route('https://concord.jaalip.com:8443/app', ORIGIN).kind).toBe('external');
    expect(route('http://concord.jaalip.com/app', ORIGIN).kind).toBe('external');
  });

  it('drops every other scheme', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'concord://invite/abc', 'ms-settings:', 'smb://host/share', 'not a url', '']) {
      expect(route(url, ORIGIN)).toEqual({ kind: 'drop' });
    }
  });

  it('follows the origin it is given, for a development client', () => {
    expect(route('http://localhost/app/login', 'http://localhost')).toEqual({ kind: 'app', url: 'http://localhost/app/login' });
    expect(route(`${ORIGIN}/app`, 'http://localhost').kind).toBe('external');
  });
});
