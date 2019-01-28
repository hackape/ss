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
  return fs.realpathSync(path);
}

function getAliasRealpath(alias) {
  const path = p.resolve(AVAILABLE, alias);
  try {
    return fs.realpathSync(path);
  } catch (err) {
    return "(null)";
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
  .command("add <alias|path> [path]")
  .description(`Add a target folder, if only <path> is given, last path component will be used as <alias>`)
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

    if (alias.includes('/')) {
      return error('Alias must not contain slash "/" charactor')
    }

    const source = p.resolve(path);
    const target = p.resolve(AVAILABLE, alias);
    try {
      fs.symlinkSync(source, target, "dir");
    } catch (err) {
      if (err.code === "EEXIST") {
        fs.unlinkSync(target);
        fs.symlinkSync(source, target, "dir");
      } else {
        console.log(chalk`{red ERROR:} Unknow error`, err);
      }
    }
  });

program
  .command("ls")
  .description(`List added target folders`)
  .action(() => {
    const printAliases = () => {
      const aliases = fs.readdirSync(AVAILABLE);
      const longest = aliases.reduce((a, b) => {
        if (a.length > b.length) return a;
        return b;
      });

      const aliasFixWidth = longest.length + 1;

      return aliases.reduce((acc, alias) => {
        const realpath = getAliasRealpath(alias);
        acc += `${padded(alias, aliasFixWidth)}-> ${realpath}\n`;
        return acc;
      }, "");
    };

    console.log(chalk`
{green Current target: }
${getCurrentPath()}

{green Aliases:}
${printAliases()}
`);
  });

program
  .command("use <alias>")
  .description('Set <alias> as the "current" directory for static serving.')
  .action(alias => {
    try {
      fs.unlinkSync(CURRENT);
    } catch (err) {}
    fs.symlinkSync(getAliasRealpath(alias), CURRENT, "dir");
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