# treng

Free English ↔ Turkish dictionary — 1,460,672 translation pairs, fully static,
served from GitHub Pages with **no server or backend**.

**Live:** https://mertnesvat.com/treng/

## How it works

- The dictionary is a prebuilt, indexed **SQLite** database, split into 32 MB chunks
  (`db/dictionary.sqlite3.NNN`) so every file fits under GitHub's 100 MB limit.
- The browser queries it with [sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs):
  SQLite compiled to WebAssembly plus a virtual filesystem that fetches only the DB
  pages a query touches via **HTTP range requests** — a lookup transfers tens of KB,
  not the ~170 MB database.
- Searches use normalized columns (`en_norm`, `tr_norm`) with Turkish-aware
  lowercasing (`I`→`ı`, `İ`→`i`) and indexed prefix range queries.
- Jekyll only renders the page shell; all search logic is client-side
  (`assets/js/search.js`).

## Rebuilding the database

```sh
# download + unzip dictionary-json.zip from firatkaya1/dictionary, then:
python3 tools/build_db.py path/to/dictionary.json
```

This writes `db/dictionary.sqlite3` (gitignored), the committed `.NNN` chunks, and
`db/config.json` for sql.js-httpvfs.

## Local development

```sh
# needs a server that supports HTTP range requests
# (python3 -m http.server does NOT — it ignores the Range header)
ruby -run -ehttpd . -p8000
open http://localhost:8000
```

## Credits

- Dictionary data: [firatkaya1/dictionary](https://github.com/firatkaya1/dictionary) (MIT)
- [sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs) by phiresky
