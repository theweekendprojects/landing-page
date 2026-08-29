/*
 * @emdash-cms/plugin-forms exposes "./styles" as a bare CSS file via its
 * package.json `exports` map. Vite resolves this fine at runtime, but the
 * specifier doesn't end in `.css`, so the ambient `declare module "*.css"`
 * from vite/client doesn't match it for type-checking. This declares it
 * explicitly so `astro check` / `tsc` stop complaining about the
 * side-effect import in Newsletter.astro.
 */
declare module "@emdash-cms/plugin-forms/styles";
