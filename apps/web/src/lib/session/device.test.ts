import { describe, expect, it } from 'vitest';
import { deviceName } from './device.ts';

describe('deviceName', () => {
  it('names the browser and the system, minding the browsers that also say Chrome or Safari', () => {
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')).toBe('Concord on Chrome, Windows');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toBe('Concord on Edge, Windows');
    expect(deviceName('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0')).toBe('Concord on Firefox, Linux');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')).toBe('Concord on Chrome, Android');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Concord on Safari, iOS');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('Concord on Safari, macOS');
  });

  it('falls back to what it recognises, then to the app name', () => {
    expect(deviceName('Mozilla/5.0 (X11; Linux x86_64) SomeBrowser/1.0')).toBe('Concord on Linux');
    expect(deviceName('curl/8.0')).toBe('Concord');
  });
});
