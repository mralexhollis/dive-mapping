/// <reference types="vite/client" />

/**
 * Vite supports importing files as raw strings via the `?raw` suffix; the
 * default Vite types don't ship a declaration for it, so we add one here so
 * `import x from './file.json?raw'` is typed as `string` instead of `any`.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
