---
layout: default
title: About
permalink: /about.html
---

# About treng

**treng** is a free English ↔ Turkish dictionary with **1,460,672 translation pairs**,
covering 200,307 English and 535,911 Turkish headwords across 140 categories.

## How it works

There is no server. The whole dictionary is a prebuilt SQLite database hosted as static
files on GitHub Pages. Your browser queries it directly using
[sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs), which runs SQLite in
WebAssembly and reads only the few database pages each lookup needs via HTTP range
requests — a search downloads tens of kilobytes, not the ~170 MB database.

## Data & credits

- Dictionary data: [firatkaya1/dictionary](https://github.com/firatkaya1/dictionary), MIT license.
- SQLite-over-HTTP: [sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs) by phiresky.
- Site source: [treng on GitHub](https://github.com/mertnesvat/treng).
