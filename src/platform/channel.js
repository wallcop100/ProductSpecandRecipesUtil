/**
 * channel.js — which build this is.
 *
 * The site is published twice (.github/workflows/pages.yml): the STABLE site at the root,
 * built from the `release` branch, and the PRE-RELEASE site under /beta/, built from master
 * on every merge. Both live on the same origin, so the pre-release keeps its own browser
 * storage (see idb.js): nothing it saves can touch a project saved on the stable site.
 */
export const CHANNEL = typeof __APP_CHANNEL__ !== 'undefined' ? __APP_CHANNEL__ : 'stable'
export const IS_PRERELEASE = CHANNEL === 'beta'
