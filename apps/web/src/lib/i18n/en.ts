/**
 * English messages (client.md section 12). Other locales must have the same shape, which the type checks.
 * A message is a string, or a function for messages with parameters or plurals.
 */
import { plural } from './plural.ts';

export const en = {
  app: {
    name: 'Concord',
    backendVersion: (version: string) => `Stoat ${version}`,
    unreachable: 'unreachable',
  },
  common: {
    members: (n: number) => plural('en', n, { one: `${n} member`, other: `${n} members` }),
  },
};

export type Messages = typeof en;
