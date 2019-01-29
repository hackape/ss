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

const print = (...args) => console.log(...args);
const warning = message => chalk`{yellow WARNING:} ${message}`;
const info = message => chalk`{magenta INFO:} ${message}`;
const error = message => chalk`{red ERROR:} ${message}`;

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
        return chalk`{green Aliases:}\n${lines.join("\n")}`;
      } else {
        return chalk`{grey No aliases found}`;
      }
    };

    print(chalk`
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
    if (!path) return print(error(`Alias ${alias} does not exist, or is invalid\n`));
    fs.symlinkSync(getAliasRealpath(alias), CURRENT, "dir");
    return print(chalk`{green Use:} now using ${alias} -> ${path}`);
  });

program
  .command("serve")
  .alias("start")
  .option("-p, --port", "Specify port number")
  .description('Start serving the "current" directory.')
  .action((_port) => {
    let port = 5000;
    if (typeof _port === 'string') {
      if (Number.isInteger(Number(_port))) port = _port;
    }

    const currentPath = getCurrentPath();
    if (!currentPath) return print(error('No "current" target directory set'));
    const server = http.createServer((request, response) => {
      return handler(request, response, {
        public: currentPath,
        cleanUrls: false,
      });
    });

    server.on("error", err => {
      print(error(`Failed to serve: ${err.stack}`));
      process.exit(1);
    });

    server.listen(port, () => {
      print(info(`Listening on port ${port}`));
      registerShutdown(() => {
        print(`\n${info("Gracefully shutting down. Please wait...")}`);

        process.on("SIGINT", () => {
          print(`\n${warning("Force-closing all open sockets...")}`);
          process.exit(0);
        });

        server.close();
      });
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

    if (!exists(path)) return print(error(`Target path "${path}" doesn's exist`));
    if (!isDirectory(path)) return print(error(`Target path "${path}" is not a directory`));

    if (!alias) alias = p.basename(path);
    alias = alias.replace(/\s/g, "_");

    if (alias.includes("/")) {
      return print(error('Alias must not contain slash "/" charactor'));
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
        return print(chalk`{red ERROR:} Unknow error`, err);
      }
    }
    return print(chalk`{green Add:} ${alias} -> ${getAliasRealpath(alias)}\n`);
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
        return print(chalk`{green Remove:} All aliases removed\n`);
      } else if (options.prune) {
        const aliases = fs.readdirSync(AVAILABLE);
        const removable = aliases.filter(alias => {
          const realpath = getAliasRealpath(alias);
          if (!realpath) return true;
          return false;
        });
        if (!removable.length) return print(chalk`{yellow Remove:} No invalid alias found, abort\n`);
        removable.forEach(alias => {
          fs.unlinkSync(p.resolve(AVAILABLE, alias));
        });
        print(chalk`{green Remove:} Prune unavailable aliases\n`);
        return print(removable.join("\n"));
      }
    } else {
      const path = p.resolve(AVAILABLE, alias);
      if (!exists(path)) return print(error(`Path ${path} doesn't exist\n`));
      fs.unlinkSync(path);
    }
  });

function main() {
  init();
  const args = program.parse(process.argv).args;
  if (_.isEmpty(args) && process.argv.length === 2) {
    program.help();
  } else if (typeof args[args.length - 1] === "string") {
    print(error(`Unkown command ${args[0]}\n`));
    program.help();
  }
}

main();
