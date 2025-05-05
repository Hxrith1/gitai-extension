const { ESLint } = require("eslint");

module.exports.analyze = async ({ file }) => {
  const eslint = new ESLint();

  // Lint the single file
  const results = await eslint.lintFiles([file]);
  const findings = [];

  for (const result of results) {
    for (const msg of result.messages) {
      findings.push({
        file: result.filePath,
        line: msg.line || 0,
        severity: msg.severity,
        message: `[${msg.ruleId}] ${msg.message}`,
      });
    }
  }

  return findings;
};
