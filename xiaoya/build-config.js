// Source and public builds never enable the internal review workbench.
// The builder replaces this module only for an explicit --internal build.
export const INTERNAL_BUILD = false;
export const BUILD_CHANNEL = 'public';
