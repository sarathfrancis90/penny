// Flat ESLint config for ESLint 9 + Next.js 16. Uses native flat-config
// plugin exports directly to avoid the @eslint/eslintrc FlatCompat shim,
// which crashes with "Converting circular structure to JSON" when Next's
// typescript config is loaded through it (the legacy validator can't
// serialize plugin objects with self-references during error formatting).

import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "mobile/**",
      "**/*.d.ts",
      // Generated service-worker / PWA code with its own globals
      "public/**/*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Disable rules that don't apply to TypeScript files. TypeScript itself
    // performs identifier resolution, so eslint's `no-undef` produces 100+
    // false positives on globals like `console`, `process`, `Headers`, etc.
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Node CLI scripts use Node globals (require, process, __dirname, etc.).
    files: ["scripts/**/*.js", "scripts/**/*.mjs", "scripts/**/*.cjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Project-wide overrides — tolerate patterns already established in the
    // codebase. New rule violations show up as warnings (visible in CI logs)
    // without breaking the build. Tighten incrementally.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@next/next/no-html-link-for-pages": "off",
      // New (2026) react-hooks rules from the post-React 19 plugin. The
      // existing codebase predates them; surface as warnings until refactored.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/immutability": "warn",
      // Empty catch blocks are intentional in our fire-and-forget patterns.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Allow expression statements like `void something()` and short-circuit
      // patterns used throughout the codebase.
      "@typescript-eslint/no-unused-expressions": [
        "warn",
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true },
      ],
      // CommonJS require() shows up in a few config/script files.
      "@typescript-eslint/no-require-imports": "off",
      // a11y: keep visible in CI as warnings, not blockers — fix incrementally.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
];
