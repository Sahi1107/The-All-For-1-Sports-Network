// `icon` is a Pictogrammers Material Design Icon name, rendered via the MDI
// webfont (loaded from a CDN in index.html) as `mdi mdi-{icon}`. MDI has no
// dedicated wrestling glyph, so WRESTLING uses the closest grappling icon.
export const SPORTS = [
  { value: 'BASKETBALL',    label: 'Basketball',    icon: 'basketball' },
  { value: 'FOOTBALL',      label: 'Football',      icon: 'soccer' },
  { value: 'CRICKET',       label: 'Cricket',       icon: 'cricket' },
  { value: 'FIELD_HOCKEY',  label: 'Field Hockey',  icon: 'hockey-sticks' },
  { value: 'BADMINTON',     label: 'Badminton',     icon: 'badminton' },
  { value: 'ATHLETICS',     label: 'Athletics',     icon: 'run-fast' },
  { value: 'WRESTLING',     label: 'Wrestling',     icon: 'mixed-martial-arts' },
  { value: 'BOXING',        label: 'Boxing',        icon: 'boxing-glove' },
  { value: 'SHOOTING',      label: 'Shooting',      icon: 'target' },
  { value: 'WEIGHTLIFTING', label: 'Weightlifting', icon: 'weight-lifter' },
  { value: 'ARCHERY',       label: 'Archery',       icon: 'bow-arrow' },
  { value: 'TENNIS',        label: 'Tennis',        icon: 'tennis' },
  { value: 'TABLE_TENNIS',  label: 'Table Tennis',  icon: 'table-tennis' },
  { value: 'RUGBY',         label: 'Rugby',         icon: 'rugby' },
  { value: 'SWIMMING',      label: 'Swimming',      icon: 'swim' },
  { value: 'VOLLEYBALL',    label: 'Volleyball',    icon: 'volleyball' },
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
