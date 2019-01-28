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
const error = message => chalk`{red ERROR:} ${message}`;

function getCurrentPath() {
  const path = p.resolve(CURRENT);
  return fs.realpathSync(path);
}

function getAliasRealpath(alias) {
  // TODO: should handle non-exist path properly
  const path = p.resolve(AVAILABLE, alias);
  return fs.realpathSync(path);
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

init();

// configure the program
program
  .command("add <alias|path> [path]")
  .description(`Add a target folder, if only <path> is given, last path component will be used as <alias>`)
  .action((alias, path) => {
    if (!alias) {
      return console.log("Invalid args. `ss add [alias] [path]`");
    }

    let missingAlias = false;
    if (!path) {
      missingAlias = true;
      path = alias;
    }

    path = p.resolve(path);

    try {
      fs.existsSync(path);
      fs.readdirSync(path);
    } catch (err) {
      return console.log(`Target folder "${path}" doesn's exist, or not a directory`);
    }

    if (missingAlias) {
      alias = p.basename(path);
    }

    alias = alias.replace(/\s/g, "_");

    p.resolve(AVAILABLE, alias);

    try {
      fs.symlinkSync(p.resolve(path), p.resolve(AVAILABLE, alias), "dir");
    } catch (err) {
      return console.log("Create symlink fail");
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
  .action(() => {
    const server = http.createServer((request, response) => {
      return handler(request, response, {});
    });

    server.on("error", err => {
      console.error(error(`Failed to serve: ${err.stack}`));
      process.exit(1);
    });

    server.listen(8888, () => {
      registerShutdown(() => server.close());
      console.log("listening on port :8888");
    });
  });

if (_.isEmpty(program.parse(process.argv).args) && process.argv.length === 2) {
  program.help();
}
