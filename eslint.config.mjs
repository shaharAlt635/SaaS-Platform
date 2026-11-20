import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    // Enforce the dependency rule: inner layers never import outer layers.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/application/*", "@/infrastructure/*", "@/server/*", "@/features/*", "@/components/*", "@/app/*"], message: "Domain must stay framework-free." },
            { group: ["next", "next/*", "react", "@/generated/*", "@prisma/*", "stripe", "better-auth", "better-auth/*"], message: "Domain must stay framework-free." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/infrastructure/*", "@/server/*", "@/features/*", "@/components/*", "@/app/*"], message: "Application layer depends only on domain and ports." },
            { group: ["next", "next/*", "react", "@/generated/*", "@prisma/*", "stripe", "better-auth", "better-auth/*"], message: "Application layer depends only on domain and ports." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "coverage/**"]),
]);
