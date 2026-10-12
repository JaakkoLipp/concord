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
    loading: 'Loading…',
  },
  common: {
    members: (n: number) => plural('en', n, { one: `${n} member`, other: `${n} members` }),
    back: 'Back',
  },
  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to Concord',
    email: 'Email',
    password: 'Password',
    submit: 'Log in',
    mfaTitle: 'Two-factor authentication',
    mfaTotpHelp: 'Enter the 6-digit code from your authenticator app.',
    mfaRecoveryHelp: 'Enter one of your recovery codes. Each code works once.',
    totpCode: 'Authentication code',
    recoveryCode: 'Recovery code',
    useRecovery: 'Use a recovery code instead',
    useTotp: 'Use your authenticator app instead',
    verify: 'Verify',
    onboardTitle: 'Choose a username',
    onboardHelp: 'This is how people find and mention you. You can change your display name later.',
    username: 'Username',
    usernameRules: '2 to 32 characters: letters, numbers, dots, dashes and underscores.',
    onboardSubmit: 'Continue',
    errors: {
      credentials: 'Wrong email or password.',
      unverified: 'Verify your email address first, using the link we sent you.',
      disabled: 'This account is disabled.',
      code: "That code didn't work. Codes change every 30 seconds.",
      ticket: 'That sign-in attempt expired. Start again.',
      rateLimited: 'Too many attempts. Wait a moment and try again.',
      username: "That username isn't available or isn't allowed.",
      network: "Can't reach the server. Check your connection.",
      unknown: 'Something went wrong. Try again.',
    },
  },
  session: {
    signedInAs: (name: string) => `Signed in as ${name}`,
    logout: 'Log out',
    connection: {
      connecting: 'Connecting…',
      ready: 'Connected',
      reconnecting: 'Reconnecting…',
      offline: 'Offline',
      'invalid-session': 'Signed out',
    },
  },
};

export type Messages = typeof en;
