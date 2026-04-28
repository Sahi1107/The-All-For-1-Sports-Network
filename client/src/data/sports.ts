export const SPORTS = [
  { value: 'BASKETBALL',    label: 'Basketball',    emoji: '\u{1F3C0}' },
  { value: 'FOOTBALL',      label: 'Football',      emoji: '\u{26BD}' },
  { value: 'CRICKET',       label: 'Cricket',       emoji: '\u{1F3CF}' },
  { value: 'FIELD_HOCKEY',  label: 'Field Hockey',  emoji: '\u{1F3D1}' },
  { value: 'BADMINTON',     label: 'Badminton',     emoji: '\u{1F3F8}' },
  { value: 'ATHLETICS',     label: 'Athletics',     emoji: '\u{1F3C3}' },
  { value: 'WRESTLING',     label: 'Wrestling',     emoji: '\u{1F93C}' },
  { value: 'BOXING',        label: 'Boxing',        emoji: '\u{1F94A}' },
  { value: 'SHOOTING',      label: 'Shooting',      emoji: '\u{1F3AF}' },
  { value: 'WEIGHTLIFTING', label: 'Weightlifting', emoji: '\u{1F3CB}' },
  { value: 'ARCHERY',       label: 'Archery',       emoji: '\u{1F3F9}' },
  { value: 'TENNIS',        label: 'Tennis',        emoji: '\u{1F3BE}' },
  { value: 'TABLE_TENNIS',  label: 'Table Tennis',  emoji: '\u{1F3D3}' },
  { value: 'RUGBY',         label: 'Rugby',         emoji: '\u{1F3C9}' },
] as const;

export type Sport = (typeof SPORTS)[number]['value'];

export const ATHLETICS_EVENT_GROUPS = [
  {
    label: 'Sprints & Middle Distance',
    events: ['100m', '200m', '400m', '800m', '1500m'],
  },
  {
    label: 'Long Distance',
    events: ['3000m Steeplechase', '5000m', '10000m'],
  },
  {
    label: 'Hurdles',
    events: ['100m Hurdles', '110m Hurdles', '400m Hurdles'],
  },
  {
    label: 'Relays',
    events: ['4x100m Relay', '4x400m Relay'],
  },
  {
    label: 'Jumps',
    events: ['High Jump', 'Pole Vault', 'Long Jump', 'Triple Jump'],
  },
  {
    label: 'Throws',
    events: ['Shot Put', 'Discus Throw', 'Hammer Throw', 'Javelin Throw'],
  },
] as const;

export const ATHLETICS_EVENTS = ATHLETICS_EVENT_GROUPS.flatMap((g) => g.events);
export type AthleticsEvent = (typeof ATHLETICS_EVENTS)[number];
