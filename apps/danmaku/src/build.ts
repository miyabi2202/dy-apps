/** Full commit SHA of the build, substituted by the site's Vite config (`define`). */
declare const __COMMIT_HASH__: string | undefined;

/** Commit hash of this build, or 'dev' where Vite didn't inject one (e.g. Jest). */
export const COMMIT_HASH = typeof __COMMIT_HASH__ === 'string' ? __COMMIT_HASH__ : 'dev';
export const SHORT_COMMIT_HASH = COMMIT_HASH.slice(0, 7);
