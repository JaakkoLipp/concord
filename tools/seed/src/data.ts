/** The seeded dataset: who exists, what the server looks like, and what people say. */

export interface Persona {
  handle: string;
  username: string;
  displayName?: string;
  avatar: boolean;
  banner: boolean;
  bio?: string;
  status?: string;
  presence?: 'Idle' | 'Focus' | 'Busy';
  roles: string[];
  /** Relative chattiness when picking message authors. */
  weight: number;
  totp?: boolean;
}

export const ADMIN = 'dev-admin';
export const DEV = 'dev';
export const TOTP = 'totp';

export const PERSONAS: Persona[] = [
  { handle: ADMIN, username: 'dev_admin', displayName: 'Ylläpito', avatar: true, banner: true, bio: 'Development admin. Owns the seeded server.', roles: ['Admin'], weight: 3 },
  { handle: 'aino', username: 'aino', displayName: 'Aino Virtanen', avatar: true, banner: true, bio: 'Moderaattori. Kahvi ennen kaikkea ☕', status: 'Moderoimassa', roles: ['Moderaattori', 'Pelaajat'], weight: 6 },
  { handle: 'ben', username: 'ben.carter', displayName: 'Ben Carter', avatar: true, banner: false, bio: 'Mod, timezone UTC+2 now. Ask me about keyboards.', roles: ['Moderaattori'], weight: 5 },
  { handle: DEV, username: 'dev', displayName: 'Dev', avatar: true, banner: true, bio: 'The everyday development login.', status: 'Testing Concord', roles: ['Pelaajat'], weight: 4 },
  { handle: TOTP, username: 'tiina', displayName: 'Tiina Toivonen', avatar: true, banner: false, bio: 'Has two-factor authentication on.', roles: ['Taiteilijat'], weight: 2, totp: true },
  { handle: 'eetu', username: 'eetu', displayName: 'Eetu Mäkinen', avatar: true, banner: false, roles: ['Pelaajat', 'Vakio'], weight: 7, presence: 'Busy', status: 'Ranked, älä häiritse' },
  { handle: 'sanna', username: 'sanna_k', displayName: 'Sanna Korhonen', avatar: true, banner: true, bio: 'Valokuvaus, retkeily, sienet 🍄', roles: ['Taiteilijat', 'Vakio'], weight: 5 },
  { handle: 'lauri', username: 'lauri.n', displayName: 'Lauri Nieminen', avatar: false, banner: false, roles: ['Vakio'], weight: 4 },
  { handle: 'maija', username: 'maija', displayName: 'Maija Heikkinen', avatar: true, banner: false, roles: ['Vakio'], weight: 3, presence: 'Idle' },
  { handle: 'juho', username: 'juho_l', displayName: 'Juho Laine', avatar: true, banner: false, bio: 'Linux, Rust ja sauna.', roles: ['Vakio', 'Pelaajat'], weight: 6 },
  { handle: 'emma', username: 'emma.w', displayName: 'Emma Walsh', avatar: true, banner: true, bio: 'Moved to Tampere in 2024. Still learning Finnish!', roles: ['Vakio'], weight: 5 },
  { handle: 'oliver', username: 'oliver', displayName: 'Oliver Grant', avatar: true, banner: false, roles: ['Pelaajat'], weight: 3, presence: 'Focus', status: 'Deadline week' },
  { handle: 'noora', username: 'noora', displayName: 'Noora Koskinen', avatar: true, banner: false, roles: ['Taiteilijat'], weight: 3 },
  { handle: 'ville', username: 'villej', displayName: 'Ville Järvinen', avatar: false, banner: false, roles: ['Pelaajat'], weight: 4 },
  { handle: 'kaisa', username: 'kaisa.l', displayName: 'Kaisa Lehtonen', avatar: true, banner: false, roles: ['Vakio'], weight: 2 },
  { handle: 'tomi', username: 'tomi', avatar: true, banner: false, roles: ['Pelaajat'], weight: 3 },
  { handle: 'riikka', username: 'riikka_h', displayName: 'Riikka Hämäläinen', avatar: true, banner: false, roles: ['Taiteilijat'], weight: 2 },
  { handle: 'mikko', username: 'mikko', displayName: 'Mikko Rantanen', avatar: true, banner: false, roles: ['Vakio'], weight: 3 },
  { handle: 'sofia', username: 'sofia.l', displayName: 'Sofia Lindqvist', avatar: true, banner: true, bio: 'Hej! Svenska, suomi, English.', roles: ['Vakio'], weight: 3 },
  { handle: 'jack', username: 'jack_m', displayName: 'Jack Morrison', avatar: false, banner: false, roles: [], weight: 2 },
  { handle: 'helmi', username: 'helmi', displayName: 'Helmi Aaltonen', avatar: true, banner: false, roles: ['Taiteilijat'], weight: 2 },
  { handle: 'pekka', username: 'pekka.o', displayName: 'Pekka Ojala', avatar: true, banner: false, roles: [], weight: 1 },
  { handle: 'lotta', username: 'lotta', displayName: 'Lotta Saarinen', avatar: true, banner: false, roles: ['Vakio'], weight: 2 },
  { handle: 'long', username: 'max_pietikainen_long_name', displayName: 'Maximilian Alexander Pietikäinen', avatar: true, banner: false, bio: 'Exists to test truncation. '.repeat(20).trim(), roles: ['Vakio'], weight: 1 },
];

export const BOT_NAME = 'kello';

/** Role order is rank order, highest first. A colour string can be a CSS gradient. */
export const ROLES = [
  { name: 'Admin', colour: '#e5484d', hoist: true },
  { name: 'Moderaattori', colour: '#f5a524', hoist: true },
  { name: 'Botit', colour: '#8b8d98', hoist: true },
  { name: 'Taiteilijat', colour: 'linear-gradient(90deg, #f472b6, #a78bfa)', hoist: false },
  { name: 'Pelaajat', colour: '#5b8def', hoist: true },
  { name: 'Vakio', colour: '#3dbd7d', hoist: false },
] as const;

/** Stoat permission bits, from revolt-permissions. */
export const P = {
  KickMembers: 6, BanMembers: 7, TimeoutMembers: 8, ManageNicknames: 11, RemoveAvatars: 13,
  SendMessage: 22, ManageMessages: 23, InviteOthers: 25, MuteMembers: 33, DeafenMembers: 34, MoveMembers: 35,
  MentionEveryone: 37, MentionRoles: 38,
} as const;
export const bits = (...b: number[]) => b.reduce((acc, n) => acc | (1n << BigInt(n)), 0n);

export const CATEGORIES = [
  { title: 'Tervetuloa', channels: [{ key: 'saannot', name: 'säännöt', readOnly: true }, { key: 'ilmoitukset', name: 'ilmoitukset', readOnly: true }] },
  { title: 'Yleinen', channels: [{ key: 'yleinen', name: 'yleinen' }, { key: 'offtopic', name: 'off-topic' }, { key: 'kuvat', name: 'kuvat-ja-videot' }, { key: 'olohuone', name: 'Olohuone', voice: true }] },
  { title: 'Pelit', channels: [{ key: 'pelit', name: 'pelit' }, { key: 'pelaamo', name: 'Pelaamo', voice: true }] },
  { title: 'Tekniikka', channels: [{ key: 'tekniikka', name: 'tekniikka', description: 'Koodi, Linux, rauta. Code, Linux, hardware.' }, { key: 'botti', name: 'botti' }] },
] as const;

export const EMOJI_NAMES = [
  'kahvi', 'sauna', 'pulla', 'mokki', 'lumi', 'revontuli', 'hirvi', 'kuusi', 'sieni', 'mustikka',
  'salmiakki', 'karhu', 'pog', 'kekw', 'pepega', 'catjam', 'gg', 'ez', 'sadge', 'hype',
  'ok_hand_cat', 'thinking_fin', 'party', 'fire_fin', 'heart_fin', 'plus_one', 'minus_one', 'ship_it', 'bug', 'lgtm',
];

export const UNICODE_REACTIONS = ['👍', '😂', '❤️', '🔥', '👀', '🎉', '😮', '🙏', '💯', '🇫🇮'];

export const CHANNEL_SIZES: Record<string, number> = {
  yleinen: 230, offtopic: 110, pelit: 100, tekniikka: 75, kuvat: 30, botti: 30, ilmoitukset: 6, saannot: 2,
};

/** Stable public pages for link embeds, which January fetches after the message is sent. */
export const LINKS = [
  'https://en.wikipedia.org/wiki/Sauna',
  'https://github.com/stoatchat/stoatchat',
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  'https://developer.mozilla.org/en-US/docs/Web/API/WebSocket',
  'https://fi.wikipedia.org/wiki/Mustikka',
];

const FI = [
  'moi kaikki', 'huomenta!', 'no niin', 'kuka lähtee illalla pelaamaan?', 'mä oon tänään vähän myöhässä',
  'joo kuulostaa hyvältä', 'ei käy mulle valitettavasti', 'kahvia ja pullaa ☕', 'sauna lämpiää', 'kiitti!',
  'toi on ihan hyvä pointti', 'en tiennyt tota', 'aika siistiä', 'mitä te ootte mieltä tästä?', 'ihan sama mulle',
  'tänään satoi taas koko päivän', 'onko kellään laturia lainaksi?', 'nähdään huomenna', 'hyvää yötä', 'haha',
  'oikeesti?', 'joo', 'ei', 'ehkä', 'voin katsoa sen myöhemmin', 'vähän tylsä päivä töissä', 'lumet sulaa jo',
  'mökille viikonloppuna', 'mustikoita oli tosi paljon tänä vuonna', 'olipas hyvä leffa', 'kuka muistaa tän?',
  'tarvitsisin apua yhden jutun kanssa', 'laitoin sen jo', 'se toimii nyt', 'ei toimi vieläkään', 'kokeile uudelleen',
];

const EN = [
  'hey everyone', 'good morning!', 'anyone up for a game tonight?', 'running a bit late today', 'sounds good to me',
  "can't make it, sorry", 'that is a fair point', 'TIL', 'this is pretty cool', 'what do you all think?',
  'thanks!', 'lol', 'no way', 'same here', 'I will check it later', 'brb', 'back', 'gn everyone',
  'did anyone see the update?', 'works on my machine', 'it finally works', 'still broken for me', 'try again?',
  'the weather is wild today', 'just got back from the cabin', 'that movie was great', 'anyone remember this?',
  'quick question about the server', 'nice', 'agreed', 'hmm, not sure about that', 'link?', 'ping me when you are on',
];

const PELIT = [
  'GG!', 'kuka mukaan rankediin?', 'joku tankki tarvitaan', 'patch notes are out', 'that last round was insane',
  'servu laggaa ihan sairaasti', 'one more game?', 'mä otan healerin', 'new season starts Friday', 'clutch 1v3 😎',
  'Minecraft-servu on taas pystyssä', 'I built the castle, come see', 'kuka bannasi mut taas', 'drop in 5 min?',
];

const TECH = [
  'mikä distro teillä on käytössä?', 'Arch btw', 'just switched to Wayland, screen share works now', 'rustc says no',
  'muistakaa varmuuskopiot', 'my build takes 4 minutes now, down from 11', 'docker compose up and pray',
  'anyone tried the new kernel?', 'pnpm vai npm?', 'TypeScript strict mode found three bugs already',
  'kuka osaa systemd-timereita?', 'PR is up, reviews welcome', 'ship it 🚀', 'the CI is red again',
];

const BOT = [
  'Muistutus: peli-ilta perjantaina klo 19.', 'Server backup completed.', 'Uusi jäsen liittyi palvelimelle.',
  'Daily tip: use Ctrl+K to jump between channels.', 'Kello on nyt 12.00.', 'Weekly stats: 412 messages, 23 active members.',
];

export const RULES = [
  '# Säännöt / Rules\n\n1. **Ole ystävällinen.** Be kind.\n2. Ei roskapostia. No spam.\n3. Pidä keskustelu oikeilla kanavilla.\n4. Spoilerit ||näin|| — use spoiler tags.\n5. Ylläpito päättää. Admins have the final say.',
  'Kysymykset ylläpidolle: lähetä viesti moderaattorille. Questions: message a moderator.',
];

export const ANNOUNCEMENTS = [
  '@everyone Tervetuloa Concordiin! Welcome to the Concord development server.',
  'Peli-ilta perjantaina klo 19 <#{channel:pelit}>. Game night on Friday at 19:00.',
  'Palvelin päivitetty versioon 0.15.5 <t:1791763200:F>.',
  'Uusia emojeita lisätty: :{emoji:kahvi}: :{emoji:sauna}: :{emoji:pulla}:',
  'Muistakaa säännöt <#{channel:saannot}>.',
  '@everyone Huoltokatko sunnuntaina <t:1792022400:R>.',
];

/** Uses every construct in architecture section 4.4, across two messages. */
export const MARKDOWN_SHOWCASE = [
  [
    '# Markdown test 1',
    '## Heading two',
    '### Heading three',
    '**bold**, *italic*, ***both***, ~~strikethrough~~, `inline code`, ||spoiler||, and a\nsingle newline line break.',
    '> A quote\n> over two lines',
    '- list item\n- another\n  - nested',
    '1. first\n2. second',
    '```rust\nfn main() {\n    println!("Hei, maailma!");\n}\n```',
    '```ts\nconst greet = (name: string) => `Hei ${name}`;\n```',
    'Autolink: https://concord.jaalip.com and [a named link](https://github.com/stoatchat/stoatchat).',
  ].join('\n\n'),
  [
    '# Markdown test 2',
    'User <@{user:aino}>, role <%{role:Moderaattori}>, channel <#{channel:yleinen}>, custom emoji :{emoji:sauna}: and unicode 🇫🇮.',
    'Timestamps: <t:1791763200:t> <t:1791763200:T> <t:1791763200:D> <t:1791763200:F> <t:1791763200:R>',
    '| Peli | Pelaajia |\n|---|---:|\n| Minecraft | 12 |\n| CS2 | 5 |',
    'Math: $$e^{i\\pi} + 1 = 0$$',
    'Escaped: \\*not italic\\* and \\`not code\\`',
    '---',
    'Mass mention in a code span: `@everyone`',
  ].join('\n\n'),
];

export function bank(channel: string): string[] {
  switch (channel) {
    case 'pelit': return [...PELIT, ...PELIT, ...FI, ...EN];
    case 'tekniikka': return [...TECH, ...TECH, ...FI, ...EN];
    case 'botti': return BOT;
    default: return [...FI, ...EN];
  }
}

/** Exactly at Stoat's limit, which counts UTF-8 bytes, not characters: each ä takes two. */
export const LONG_MESSAGE = (() => {
  const words = 'Tämä on pitkä viesti, joka testaa kahden tuhannen tavun rajaa. This is a long message that tests the 2000-byte limit. ';
  let out = '';
  for (const c of words.repeat(30)) {
    if (Buffer.byteLength(out + c) > 2000) break;
    out += c;
  }
  return out;
})();
