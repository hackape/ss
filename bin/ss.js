#! /usr/bin/env node

const program = require("commander");
const _ = require("lodash");
const p = require("path");
const fs = require("fs");
const chalk = require("chalk");
const http = require("http");
const handler = require("serve-handler");

const homedir = require("os").homedir();

const NSP = p.resolve(homedir, ".ss");
const AVAILABLE = p.resolve(NSP, "available");
const CURRENT = p.resolve(NSP, "current");

const exists = path => fs.existsSync(path);
const isDirectory = path => fs.lstatSync(path).isDirectory();
const isSymlink = path => fs.lstatSync(path).isSymbolicLink();
const error = message => console.error(chalk`{red ERROR:} ${message}`);

function getCurrentPath() {
  const path = p.resolve(CURRENT);
  try {
    return fs.realpathSync(path);
  } catch (err) {
    return null;
  }
}

function getAliasRealpath(alias) {
  const path = p.resolve(AVAILABLE, alias);
  try {
    return fs.realpathSync(path);
  } catch (err) {
    return null;
  }
}

function padded(str, length) {
  return str + " ".repeat(length - str.length);
}

function registerShutdown(fn) {
  let run = false;

  const wrapper = () => {
    if (!run) {
      run = true;
      fn();
    }
  };

  process.on("SIGINT", wrapper);
  process.on("SIGTERM", wrapper);
  process.on("exit", wrapper);
}

// initialization
function init() {
  if (!exists(NSP)) fs.mkdirSync(NSP);
  if (!exists(AVAILABLE)) fs.mkdirSync(AVAILABLE);
}

// configure the program
program
  .command("ls")
  .description(`List added aliases and target folders`)
  .action(() => {
    const printAliases = () => {
      const aliases = fs.readdirSync(AVAILABLE);
      const longest = aliases.reduce((a, b) => {
        if (a.length > b.length) return a;
        return b;
      }, "");

      const aliasFixWidth = longest.length + 1;

      const lines = aliases.map(alias => {
        const realpath = getAliasRealpath(alias);
        return `${padded(alias, aliasFixWidth)}-> ${realpath}`;
      });

      if (lines.length) {
        return (chalk`{green Aliases:}\n${lines.join('\n')}`)
      } else {
        return (chalk`{grey No aliases found}`)
      }
    };

    console.log(chalk`
{green Current target: }
${getCurrentPath()}

${printAliases()}
`);
  });

program
  .command("use <alias>")
  .description('Set <alias> as the "current" directory for static serving.')
  .action(alias => {
    if (exists(CURRENT)) {
      fs.unlinkSync(CURRENT);
    }
    const path = getAliasRealpath(alias);
    if (!path) return error(`Alias ${alias} does not exist, or is invalid\n`)
    fs.symlinkSync(getAliasRealpath(alias), CURRENT, "dir");
    return console.log(chalk`{green Use:} now using ${alias} -> ${path}`)
  });

program
  .command("serve")
  .alias("start")
  .description('Start serving the "current" directory.')
  .action(() => {
    const server = http.createServer((request, response) => {
      return handler(request, response, {});
    });

    server.on("error", err => {
      error(`Failed to serve: ${err.stack}`);
      process.exit(1);
    });

    server.listen(8888, () => {
      registerShutdown(() => server.close());
      console.log("listening on port :8888");
    });
  });

program
  .command("add <alias|path> [path]")
  .description(`Add a target folder. If only <path> is given, last path component will be used as <alias>`)
  .action((alias, path) => {
    if (!path) {
      alias = undefined;
      path = alias;
    }

    path = p.resolve(path);

    if (!exists(path)) return error(`Target path "${path}" doesn's exist`);
    if (!isDirectory(path)) return error(`Target path "${path}" is not a directory`);

    if (!alias) alias = p.basename(path);
    alias = alias.replace(/\s/g, "_");

    if (alias.includes("/")) {
      return error('Alias must not contain slash "/" charactor');
    }

    const source = p.resolve(path);
    const target = p.resolve(AVAILABLE, alias);
    try {
      fs.symlinkSync(source, target, "dir");
    } catch (err) {
      if (err.code === "EEXIST") {
        // TODO: ask user if should override
        fs.unlinkSync(target);
        fs.symlinkSync(source, target, "dir");
      } else {
        return console.log(chalk`{red ERROR:} Unknow error`, err);
      }
    }
    return console.log(chalk`{green Add:} ${alias} -> ${getAliasRealpath(alias)}\n`);
  });

program
  .command("remove [alias]")
  .description("Remove specified [alias], or [--all] to remove all, or [--prune] to remove invalid alias")
  .option("-A, --all", "Remove all aliases")
  .option("-P, --prune", "Remove all invalid aliases")
  .action((alias, options) => {
    if (!alias) {
      if (options.all) {
        const aliases = fs.readdirSync(AVAILABLE);
        aliases.forEach(alias => {
          fs.unlinkSync(p.resolve(AVAILABLE, alias));
        });
        return console.log(chalk`{green Remove:} All aliases removed\n`);
      } else if (options.prune) {
        const aliases = fs.readdirSync(AVAILABLE);
        const removable = aliases.filter(alias => {
          const realpath = getAliasRealpath(alias);
          if (!realpath) return true;
          return false;
        });
        if (!removable.length) return console.log(chalk`{yellow Remove:} No invalid alias found, abort\n`)
        removable.forEach(alias => {
          fs.unlinkSync(p.resolve(AVAILABLE, alias));
        });
        console.log(chalk`{green Remove:} Prune unavailable aliases\n`);
        return console.log(removable.join('\n'));
      }
    } else {
      const path = p.resolve(AVAILABLE, alias);
      if (!exists(path)) return error(`Path ${path} doesn't exist\n`);
      fs.unlinkSync(path);
    }
  });

function main() {
  init();
  const args = program.parse(process.argv).args;
  if (_.isEmpty(args) && process.argv.length === 2) {
    program.help();
  } else if (typeof args[args.length - 1] === "string") {
    error(`Unkown command ${args[0]}\n`);
    program.help();
  }
}

main();
