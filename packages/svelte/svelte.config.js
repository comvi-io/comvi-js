import { sveltePreprocess } from "svelte-preprocess";

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  preprocess: sveltePreprocess({
    typescript: {
      tsconfigFile: false,
      compilerOptions: {
        target: "esnext",
        module: "esnext",
        moduleResolution: "bundler",
        verbatimModuleSyntax: true,
        isolatedModules: true,
      },
    },
  }),
};
