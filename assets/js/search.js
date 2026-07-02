/* treng — client-side dictionary search.
 * Queries the chunked SQLite file over HTTP range requests (sql.js-httpvfs);
 * each lookup fetches only the index/table pages it touches. No server. */
(function () {
  "use strict";

  var input = document.getElementById("q");
  var statusEl = document.getElementById("status");
  var resultsEl = document.getElementById("results");

  var MAX_ROWS = 300;
  var SUGGESTIONS = 12;
  var HIGH = "￿";

  var workerPromise = null;
  var seq = 0;

  function initWorker() {
    if (!workerPromise) {
      statusEl.textContent = "Loading database…";
      workerPromise = createDbWorker(
        [{ from: "jsonconfig", configUrl: new URL("db/config.json", location.href).toString() }],
        new URL("vendor/sqljs-httpvfs/sqlite.worker.js", location.href).toString(),
        new URL("vendor/sqljs-httpvfs/sql-wasm.wasm", location.href).toString()
      );
    }
    return workerPromise;
  }

  // Turkish-aware lowercasing must match tools/build_db.py (I->ı, İ->i).
  function trLower(s) {
    return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
  }
  function enLower(s) {
    return s.toLowerCase();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function exactQuery(db, col, norm) {
    return db.query(
      "SELECT en, tr, type, category FROM entry WHERE " + col + " = ? ORDER BY id LIMIT " + MAX_ROWS,
      [norm]
    );
  }

  function prefixQuery(db, col, side, norm) {
    return db.query(
      "SELECT DISTINCT " + side + " AS w FROM entry WHERE " + col + " > ? AND " + col + " < ? LIMIT " + SUGGESTIONS,
      [norm, norm + HIGH]
    );
  }

  function renderSection(title, headKey, otherKey, rows) {
    var html = '<section><h2>' + esc(title) + "</h2>";
    html += "<table><thead><tr><th>Category</th><th>" +
      (headKey === "en" ? "English" : "Turkish") + "</th><th></th><th>" +
      (headKey === "en" ? "Turkish" : "English") + "</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      html += "<tr><td class='cat'>" + esc(r.category || "") + "</td>" +
        "<td class='head'>" + esc(r[headKey]) + "</td>" +
        "<td class='type'>" + esc(r.type || "") + "</td>" +
        "<td class='trans'><a href='#' data-word='" + esc(r[otherKey]) + "'>" + esc(r[otherKey]) + "</a></td></tr>";
    });
    return html + "</tbody></table></section>";
  }

  function renderSuggestions(words) {
    if (!words.length) return "";
    return "<p class='suggest'>Did you mean: " + words.map(function (w) {
      return "<a href='#' data-word='" + esc(w) + "'>" + esc(w) + "</a>";
    }).join(", ") + "</p>";
  }

  async function search(raw, dir) {
    var my = ++seq;
    var q = raw.trim();
    if (!q) { resultsEl.innerHTML = ""; statusEl.textContent = ""; return; }

    var worker;
    try {
      worker = await initWorker();
    } catch (e) {
      statusEl.textContent = "Failed to load the database: " + e.message;
      return;
    }
    if (my !== seq) return;
    statusEl.textContent = "Searching…";

    var t0 = performance.now();
    var db = worker.db;
    var enNorm = enLower(q);
    var trNorm = trLower(q);
    var sections = [];
    var suggestions = [];

    try {
      var wantEn = dir === "en" || dir === "auto";
      var wantTr = dir === "tr" || dir === "auto";
      var enRows = wantEn ? await exactQuery(db, "en_norm", enNorm) : [];
      if (my !== seq) return;
      var trRows = wantTr ? await exactQuery(db, "tr_norm", trNorm) : [];
      if (my !== seq) return;

      if (enRows.length) sections.push(renderSection('English → Turkish — "' + q + '"', "en", "tr", enRows));
      if (trRows.length) sections.push(renderSection('Turkish → English — "' + q + '"', "tr", "en", trRows));

      if (!sections.length) {
        var sug = [];
        if (wantEn) sug = sug.concat(await prefixQuery(db, "en_norm", "en", enNorm));
        if (my !== seq) return;
        if (wantTr) sug = sug.concat(await prefixQuery(db, "tr_norm", "tr", trNorm));
        if (my !== seq) return;
        suggestions = sug.map(function (r) { return r.w; }).slice(0, SUGGESTIONS);
      }
    } catch (e) {
      if (my !== seq) return;
      statusEl.textContent = "Query failed: " + e.message;
      return;
    }

    var ms = Math.round(performance.now() - t0);
    if (sections.length) {
      resultsEl.innerHTML = sections.join("");
      var n = resultsEl.querySelectorAll("tbody tr").length;
      statusEl.textContent = n + (n === MAX_ROWS * sections.length ? "+" : "") + " results in " + ms + " ms";
    } else {
      resultsEl.innerHTML = renderSuggestions(suggestions);
      statusEl.textContent = suggestions.length
        ? 'No exact match for "' + q + '"'
        : 'No results for "' + q + '"';
    }
  }

  function currentDir() {
    return document.querySelector("input[name=dir]:checked").value;
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { search(input.value, currentDir()); }, 250);
  }

  input.addEventListener("input", schedule);
  document.querySelectorAll("input[name=dir]").forEach(function (r) {
    r.addEventListener("change", function () { search(input.value, currentDir()); });
  });
  resultsEl.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-word]");
    if (!a) return;
    e.preventDefault();
    input.value = a.getAttribute("data-word");
    search(input.value, currentDir());
    input.focus();
  });

  // Support shareable links: /?q=word searches on load.
  var initialQ = new URLSearchParams(location.search).get("q");
  if (initialQ) {
    input.value = initialQ;
    search(initialQ, currentDir());
  } else {
    // Warm the wasm + DB header in the background so the first search is fast.
    initWorker().then(function () {
      if (!input.value) statusEl.textContent = "";
    }).catch(function (e) {
      statusEl.textContent = "Failed to load the database: " + e.message;
    });
  }
})();
