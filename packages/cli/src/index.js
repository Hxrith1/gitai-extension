#!/usr/bin/env node

const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const chalk = require("chalk");
const pluginManager = require("@gitai/plugin-manager");

const program = new Command();
const CONFIG_FILE = path.resolve(process.cwd(), ".gitai.yml");

program.name("gitai").description("GitAI Copilot CLI").version("0.1.0");

program
  .command("init")
  .description("Create a .gitai.yml in your repo")
  .action(() => {
    if (fs.existsSync(CONFIG_FILE)) {
      console.log(chalk.yellow(".gitai.yml already exists!"));
      process.exit(1);
    }
    const defaultConfig = {
      version: 1,
      plugins: [],
      lint: {},
      analyze: { ast: true, dataflow: true },
    };
    fs.writeFileSync(CONFIG_FILE, yaml.dump(defaultConfig));
    console.log(chalk.green("Created .gitai.yml"));
  });

program
  .command("analyze [dir]")
  .description("Run static + LLM checks")
  .action(async (dir = ".") => {
    console.log(chalk.blue(`Analyzing ${dir}…`));
    try {
      const cfg = pluginManager.loadConfig(process.cwd());
      const findings = await pluginManager.analyze(dir, cfg);

      if (findings.length === 0) {
        console.log(chalk.green("✓ No issues found."));
        return;
      }

      const byFile = findings.reduce((map, f) => {
        (map[f.file] = map[f.file] || []).push(f);
        return map;
      }, {});

      for (const [absPath, items] of Object.entries(byFile)) {
        const relPath = path.relative(process.cwd(), absPath);
        console.log(chalk.underline.cyan(relPath));

        for (const { severity, plugin, line, message } of items) {
          const sevLabel =
            severity === 2 ? chalk.red("error") : chalk.yellow("warning");
          const pluginName = path.basename(plugin, path.extname(plugin));
          console.log(
            `  ${sevLabel} ${chalk.green(pluginName)}:${line} — ${message}`,
          );
        }
      }

      process.exit(1);
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("fmt [dir]")
  .description("Auto-fix code using ESLint --fix and Prettier")
  .action(async (dir = ".") => {
    console.log(chalk.blue(`Formatting ${dir}…`));
    try {
      // ---- ESLint auto-fix ----
      const { ESLint } = require("eslint");
      const eslint = new ESLint({ fix: true });
      const eslintResults = await eslint.lintFiles([dir]);
      await ESLint.outputFixes(eslintResults);

      const fixedByEslint = eslintResults.filter(
        (r) => typeof r.output === "string",
      );
      if (fixedByEslint.length) {
        console.log(
          chalk.green(`✓ ESLint fixed ${fixedByEslint.length} file(s):`),
        );
        fixedByEslint.forEach((r) => {
          console.log(`  • ${path.relative(process.cwd(), r.filePath)}`);
        });
      } else {
        console.log(chalk.green("✓ ESLint: no fixes needed."));
      }

      // ---- Prettier formatting ----
      const prettier = require("prettier");
      const fg = require("fast-glob");

      const files = await fg(["**/*.js", "**/*.ts"], {
        cwd: dir,
        absolute: true,
        ignore: ["**/node_modules/**"],
      });

      const fixedByPrettier = [];
      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        const options = (await prettier.resolveConfig(file)) || {};
        options.filepath = file;

        // await format() since it can return a Promise
        let formatted = prettier.format(source, options);
        if (formatted && typeof formatted.then === "function") {
          formatted = await formatted;
        }

        if (formatted !== source) {
          fs.writeFileSync(file, formatted);
          fixedByPrettier.push(path.relative(process.cwd(), file));
        }
      }

      if (fixedByPrettier.length) {
        console.log(
          chalk.green(
            `✓ Prettier formatted ${fixedByPrettier.length} file(s):`,
          ),
        );
        fixedByPrettier.forEach((f) => console.log(`  • ${f}`));
      } else {
        console.log(chalk.green("✓ Prettier: no changes needed."));
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
