#!/usr/bin/env python3
"""Build db/dictionary.sqlite3 from the firatkaya1/dictionary JSON dump.

Usage:
    python3 tools/build_db.py path/to/dictionary.json [output.sqlite3]

The source is a flat JSON array of {"word": EN, "category": str, "type": str,
"tr": TR}. We denormalize into a single `entry` table with normalized search
columns for both directions, indexed for prefix range queries, and emit a
db/config.json consumed by assets/js/search.js (sql.js-httpvfs).
"""
import json
import sqlite3
import sys
from pathlib import Path

PAGE_SIZE = 4096  # must match requestChunkSize in db/config.json
SERVER_CHUNK = 32 * 1024 * 1024  # split size; must be a multiple of PAGE_SIZE
BATCH = 50_000


def tr_lower(s):
    """Turkish-aware lowercase: I->ı and İ->i before ASCII lowering."""
    return s.replace("I", "ı").replace("İ", "i").lower()


def iter_entries(json_path):
    """Yield (en, tr, type, category) tuples, streaming if ijson is available."""
    try:
        import ijson

        with open(json_path, "rb") as f:
            for item in ijson.items(f, "item"):
                yield item
    except ImportError:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        yield from data


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    json_path = Path(sys.argv[1])
    root = Path(__file__).resolve().parent.parent
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "db" / "dictionary.sqlite3"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.unlink(missing_ok=True)

    con = sqlite3.connect(out_path)
    con.execute(f"PRAGMA page_size = {PAGE_SIZE}")
    con.execute("PRAGMA journal_mode = OFF")
    con.execute("PRAGMA synchronous = OFF")
    con.execute(
        """CREATE TABLE entry (
             id       INTEGER PRIMARY KEY,
             en       TEXT NOT NULL,
             tr       TEXT NOT NULL,
             type     TEXT,
             category TEXT,
             en_norm  TEXT NOT NULL,
             tr_norm  TEXT NOT NULL
           )"""
    )

    rows, total, skipped = [], 0, 0
    for item in iter_entries(json_path):
        en = (item.get("word") or "").strip()
        tr = (item.get("tr") or "").strip()
        if not en or not tr:
            skipped += 1
            continue
        rows.append(
            (en, tr, item.get("type"), item.get("category"), en.casefold(), tr_lower(tr))
        )
        if len(rows) >= BATCH:
            con.executemany(
                "INSERT INTO entry (en,tr,type,category,en_norm,tr_norm) VALUES (?,?,?,?,?,?)",
                rows,
            )
            total += len(rows)
            rows.clear()
            print(f"\r{total:,} rows", end="", flush=True)
    if rows:
        con.executemany(
            "INSERT INTO entry (en,tr,type,category,en_norm,tr_norm) VALUES (?,?,?,?,?,?)",
            rows,
        )
        total += len(rows)
    print(f"\r{total:,} rows inserted, {skipped} skipped")

    print("Creating indexes...")
    con.execute("CREATE INDEX idx_en_norm ON entry(en_norm)")
    con.execute("CREATE INDEX idx_tr_norm ON entry(tr_norm)")
    con.commit()
    print("VACUUM...")
    con.execute("VACUUM")
    con.close()

    # Split into chunks that fit under GitHub's 100 MB file limit; served with
    # sql.js-httpvfs serverMode "chunked". The full .sqlite3 stays gitignored
    # for local CLI testing.
    db_bytes = out_path.stat().st_size
    print(f"Splitting {db_bytes / 1024 / 1024:.1f} MB into {SERVER_CHUNK // 1024 // 1024} MB chunks...")
    for old in out_path.parent.glob(out_path.name + ".[0-9]*"):
        old.unlink()
    n_chunks = 0
    with open(out_path, "rb") as f:
        while True:
            chunk = f.read(SERVER_CHUNK)
            if not chunk:
                break
            (out_path.parent / f"{out_path.name}.{n_chunks:03d}").write_bytes(chunk)
            n_chunks += 1

    config = {
        "serverMode": "chunked",
        "requestChunkSize": PAGE_SIZE,
        "databaseLengthBytes": db_bytes,
        "serverChunkSize": SERVER_CHUNK,
        "urlPrefix": f"{out_path.name}.",
        "suffixLength": 3,
    }
    config_path = out_path.parent / "config.json"
    config_path.write_text(json.dumps(config, indent=2))

    print(f"Done: {out_path} ({db_bytes / 1024 / 1024:.1f} MB) -> {n_chunks} chunks, config at {config_path}")


if __name__ == "__main__":
    main()
