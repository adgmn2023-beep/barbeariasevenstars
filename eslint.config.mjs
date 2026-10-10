import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
// Navegações após mudanças de sessão recarregam a página para descartar dados do usuário anterior.
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    ".next/**",
    "public/sw.js",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
]);
