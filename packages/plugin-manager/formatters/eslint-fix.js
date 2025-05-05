// packages/plugin-manager/src/formatters/eslint-fix.js
const { ESLint } = require("eslint");

module.exports.format = async ({ files, options }) => {
  const eslint = new ESLint({ fix: true, ...options });
  const results = await eslint.lintFiles(files);
  await ESLint.outputFixes(results);
  // Return only the file paths ESLint actually modified
  return results
    .filter((r) => typeof r.output === "string")
    .map((r) => r.filePath);
};
