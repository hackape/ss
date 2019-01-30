# ss - Static Server CLI

`ss` is built on top of [`serve`](https://github.com/zeit/serve) by [@ZEIT](https://github.com/zeit). It serves the same purpose of serving static files, but adds some nice features to help you manage your target directories.

## Usage

### Installation

`ss` is a CLI tool meant to be installed globally:

```
yarn global add @hackape/ss
```

### `add` command

Before you start serving static files, first add your target directory and give it a memorable alias:

```
ss add <my-alias> </path/to/my-app>
```

Relative path is acceptable, will be resolved relative to your current working directory.

### `use` command

```
ss use <my-alias>
```

Set the current serving directory to one of your added alias.

### `serve` command

```
ss serve
```

Start serving the current target directory.
