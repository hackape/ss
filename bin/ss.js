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

function init() {
  try {
    fs.mkdirSync(NSP);
    fs.mkdirSync(AVAILABLE);
  } catch (err) {
    // give up;
  }
}

init();

const error = message => chalk`{red ERROR:} ${message}`;
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

program
  .command("add <alias|path> [path]")
  .description(`Add a target folder, if only <path> is given, last path component will be used as <alias>`)
  .action((alias, path) => {
    if (!alias) {
      return console.log("Invalid args. `ss add [alias] [path]`");
    }

    const missingAlias = false;
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

    alias = alias.replace(" ", "_");

    try {
      fs.symlinkSync(p.resolve(path), p.resolve(AVAILABLE, alias), "dir");
    } catch (err) {
      return console.log("Create symlink fail");
    }
  });

function getRealpath(alias) {
  // TODO: should handle non-exist path properly
  const path = p.resolve(AVAILABLE, alias);
  return fs.realpathSync(path);
}

program
  .command("ls")
  .description(`List added target folders`)
  .action(() => {
    const aliases = fs.readdirSync(AVAILABLE);

    aliases.forEach(alias => {
      const realpath = getRealpath(alias);
      console.log(`${alias}\t-->\t${realpath}`);
    });
  });

program
  .command("use <alias>")
  .description('Set <alias> as the "current" directory for static serving.')
  .action(alias => {
    fs.symlinkSync(getRealpath(alias), CURRENT, "dir");
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
