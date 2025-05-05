// packages/plugin-manager/src/formatters/prettier.js
const fs = require("fs");
const prettier = require("prettier");

module.exports.format = async ({ files, options }) => {
  const changed = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    // load config for this file, merged with any plugin options
    const config = (await prettier.resolveConfig(file)) || {};
    Object.assign(config, options);
    config.filepath = file;
    const formatted = await prettier.format(source, config);
    if (formatted !== source) {
      fs.writeFileSync(file, formatted);
      changed.push(file);
    }
  }
  return changed;
};
