/** Full commit SHA of the build, substituted by the shared Vite config (`define`). */
declare const __COMMIT_HASH__: string | undefined;

export const SHORT_COMMIT_HASH =
  typeof __COMMIT_HASH__ === 'string' ? __COMMIT_HASH__.slice(0, 7) : 'dev';
