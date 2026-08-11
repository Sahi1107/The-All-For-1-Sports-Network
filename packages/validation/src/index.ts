// Barrel for @af1/validation — the single source of truth for request/response
// schemas, shared by the server (runtime validation) and, over time, the web and
// mobile clients (form validation + inferred types). Export names are unique
// across modules, so a flat re-export is collision-free.
export * from './common';
export * from './admin';
export * from './announcement';
export * from './appeal';
export * from './auth';
export * from './message';
export * from './post';
export * from './search';
export * from './team';
export * from './tournament';
export * from './tracker';
export * from './user';
