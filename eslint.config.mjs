import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "convex/_generated/**",
      "public/sw.js",
      "reference repos/**",
    ],
  },
  ...next,
  ...nextTs,
];

export default eslintConfig;
