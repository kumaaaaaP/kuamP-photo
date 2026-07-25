#!/usr/bin/env node
/**
 * くまP撮影記録 — 静的サイトジェネレーター
 *
 * data/site.json          … サイト名・会社一覧
 * data/types/*.json       … 形式ページのデータ（所属ごとの編成一覧を含む）
 * data/trains/*.json      … 編成ページのデータ（存在する = 撮影済み）
 * data/latest.json        … ホームの「最新更新画像」
 *
 * 生成物:
 *   index.html
 *   {company}.html
 *   {type}.html
 *   {company}/{affiliation}/{type}-{number}.html
 *
 * 実行: node scripts/generate.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CSS_HREF = "assets/style.css";

// ---------- ユーティリティ ----------
function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`読み込み失敗: ${p}\n${e.message}`);
  }
}
function listJSONFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function writeFile(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  console.log("生成:", relPath);
}
function assetPrefix(depth) {
  return depth === 0 ? "" : "../".repeat(depth);
}

// ---------- 読み込み ----------
const site = readJSON(path.join(DATA, "site.json"), { siteName: "くまP撮影記録", companies: [] });
const latest = readJSON(path.join(DATA, "latest.json"), []);
const types = listJSONFiles(path.join(DATA, "types")).map((f) => readJSON(f));
const trains = listJSONFiles(path.join(DATA, "trains")).map((f) => readJSON(f));

const trainByKey = new Map();
for (const t of trains) trainByKey.set(`${t.type}-${t.number}`, t);

function companyName(id) {
  const c = site.companies.find((c) => c.id === id);
  return c ? c.name : id;
}

// ---------- 共通レイアウト ----------
function layout({ title, depth, breadcrumb, body }) {
  const pre = assetPrefix(depth);
  const home = pre || "./";
  const crumbHtml = renderBreadcrumb(breadcrumb, pre);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | ${esc(site.siteName)}</title>
<link rel="stylesheet" href="${pre}${CSS_HREF}">
</head>
<body>
<header class="site-header">
  <h1><a href="${home}index.html">${esc(site.siteName)}</a></h1>
</header>
<div class="page-container">
${crumbHtml}
${body}
${crumbHtml.replace('class="breadcrumb"', 'class="breadcrumb bottom-breadcrumb"')}
</div>
<footer class="site-footer">© ${esc(site.siteName)}</footer>
</body>
</html>
`;
}

function renderBreadcrumb(items, pre) {
  const parts = items.map((it) =>
    it.href ? `<a href="${pre}${it.href}">${esc(it.label)}</a>` : `<strong>${esc(it.label)}</strong>`
  );
  return `<nav class="breadcrumb">${parts.join('<span class="sep">&gt;</span>')}</nav>`;
}

// ---------- 編成ボタン ----------
function trainButton(typeId, t) {
  const key = `${typeId}-${t.number}`;
  const trainPage = trainByKey.get(key);
  const shot = !!trainPage;
  if (t.active === false) {
    return `<span class="train-btn retired" title="非現存">${esc(t.number)}</span>`;
  }
  if (shot) {
    return `<a class="train-btn shot" href="${esc(trainPage.company)}/${esc(trainPage.affiliation)}/${esc(typeId)}-${esc(t.number)}.html">${esc(t.number)}</a>`;
  }
  return `<span class="train-btn unshot" title="未撮影">${esc(t.number)}</span>`;
}

// ---------- ホームページ ----------
function buildHome() {
  const companyItems = site.companies
    .map((c) => `<a class="company-card" href="${esc(c.id)}.html">${esc(c.name)}</a>`)
    .join("\n");
  const latestItems = latest
    .slice(0, 12)
    .map((p) => `<figure>
  <img src="${esc(p.src)}" alt="${esc(p.caption || "")}" loading="lazy">
  <figcaption>${esc(p.caption || "")}</figcaption>
</figure>`)
    .join("\n");

  const body = `
<h2 class="page-title">くまP撮影記録</h2>
<div class="section-block">
  <span class="tag-label">会社一覧</span>
  <div class="company-list">
    ${companyItems || "<p>まだ会社が登録されていません。</p>"}
  </div>
</div>
<div class="section-block">
  <span class="tag-label">最新更新画像</span>
  <div class="latest-grid">
    ${latestItems || "<p>まだ画像がありません。</p>"}
  </div>
</div>
`;
  writeFile("index.html", layout({ title: "ホーム", depth: 0, breadcrumb: [{ label: "ホーム" }], body }));
}

// ---------- 会社ページ ----------
function buildCompanyPages() {
  for (const c of site.companies) {
    const companyTypes = types.filter((t) => t.company === c.id);
    const byAffiliation = new Map();
    for (const t of companyTypes) {
      for (const aff of t.affiliations || []) {
        if (!byAffiliation.has(aff.id)) byAffiliation.set(aff.id, { name: aff.name, types: [] });
        byAffiliation.get(aff.id).types.push({ id: t.id, name: t.name });
      }
    }
    const blocks = [...byAffiliation.values()]
      .map((a) => `<div class="affiliation-block">
  <span class="tag-label">${esc(a.name)}</span>
  <ul class="type-links">
    ${a.types.map((t) => `<li><a href="${esc(t.id)}.html">${esc(t.name)}</a></li>`).join("\n    ")}
  </ul>
</div>`)
      .join("\n");

    const body = `
<h2 class="page-title">${esc(c.name)}</h2>
${blocks || "<p>まだ形式が登録されていません。</p>"}
`;
    writeFile(`${c.id}.html`, layout({
      title: c.name, depth: 0,
      breadcrumb: [{ label: "ホーム", href: "index.html" }, { label: c.name }],
      body,
    }));
  }
}

// ---------- 形式ページ ----------
function buildTypePages() {
  for (const t of types) {
    const cName = companyName(t.company);
    const affiliationBlocks = (t.affiliations || [])
      .map((aff) => {
        const groupBlocks = (aff.groups || [])
          .map((g) => {
            const buttons = (g.trains || []).map((tr) => trainButton(t.id, tr)).join("\n      ");
            return `<div class="train-group">
    <span class="tag-label">${esc(g.label)}</span>
    <div class="train-buttons">
      ${buttons}
    </div>
  </div>`;
          })
          .join("\n");
        return `<div class="affiliation-block">
  <h3>${esc(aff.name)}</h3>
  ${groupBlocks}
</div>`;
      })
      .join("\n");

    const body = `
<h2 class="page-title">${esc(t.name)}</h2>
${t.description ? `<p>${esc(t.description)}</p>` : ""}
${affiliationBlocks || "<p>まだ編成が登録されていません。</p>"}
<div class="legend">
  <span><span class="swatch" style="background:#e6f0ff;border-color:#b7d3f7"></span>撮影済み</span>
  <span><span class="swatch" style="background:#fff"></span>未撮影</span>
  <span><span class="swatch" style="background:#e5e5e5"></span>非現存</span>
</div>
`;
    writeFile(`${t.id}.html`, layout({
      title: t.name, depth: 0,
      breadcrumb: [
        { label: "ホーム", href: "index.html" },
        { label: cName, href: `${t.company}.html` },
        { label: t.name },
      ],
      body,
    }));
  }
}

// ---------- 編成ページ ----------
function formationHtml(formation) {
  if (!formation || !Array.isArray(formation.cars) || !formation.cars.length) {
    return `<p class="no-formation-note">この編成の編成表は登録されていません。</p>`;
  }
  const direction = formation.direction
    ? `<div class="direction-label">${esc(formation.direction)}</div>`
    : "";
  const headerRow = formation.cars.map((c) => `<th>${esc(c.type || "")}</th>`).join("");
  const dataRow = formation.cars.map((c) => `<td>${esc(c.number || "")}</td>`).join("");
  return `${direction}
    <table class="formation-table">
      <thead><tr>${headerRow}</tr></thead>
      <tbody><tr>${dataRow}</tr></tbody>
    </table>`;
}

function historyHtml(history) {
  if (!Array.isArray(history) || !history.length) {
    return `<p class="no-formation-note">車歴はまだ登録されていません。</p>`;
  }
  return history
    .map((h) => `<div class="history-entry">
    <span class="tag-label">${esc(h.event || "")}</span><br>
    <div class="history-detail">${esc(h.date || "")}${h.note ? esc(h.note) : ""}</div>
  </div>`)
    .join("\n");
}

function photosHtml(photos) {
  if (!Array.isArray(photos) || !photos.length) {
    return `<p class="no-formation-note">写真はまだ登録されていません。</p>`;
  }
  const cells = photos
    .map((p) => {
      const rows = [];
      if (p.date) rows.push(`<tr><th>撮影日</th><td>${esc(p.date)}</td></tr>`);
      if (p.trainNumber) rows.push(`<tr><th>列車番号</th><td>${esc(p.trainNumber)}</td></tr>`);
      if (p.destination) rows.push(`<tr><th>種別・行先</th><td>${esc(p.destination)}</td></tr>`);
      if (p.location) rows.push(`<tr><th>撮影地</th><td>${esc(p.location)}</td></tr>`);
      if (p.note) rows.push(`<tr><th>備考</th><td>${esc(p.note)}</td></tr>`);
      return `<table class="photo-table">
<tbody>
<tr><td colspan="2" class="image-wrapper">
<img src="${esc(photoPathFromRoot(p.src))}" alt="${esc(p.caption || "")}" loading="lazy">
</td></tr>
${rows.join("\n")}
</tbody>
</table>`;
    })
    .join("\n");
  return `<div class="photo-grid">\n${cells}\n</div>`;
}

// image/223/J4/1.webp のようなルート基準パス → 編成ページ(depth=2)から見た相対パス
function photoPathFromRoot(src) {
  return "../../" + String(src).replace(/^\/+/, "");
}

function buildTrainPages() {
  for (const tr of trains) {
    const typeData = types.find((t) => t.id === tr.type);
    const typeName = tr.typeName || (typeData ? typeData.name : tr.type);
    const cName = tr.companyName || companyName(tr.company);
    const affName =
      tr.affiliationName ||
      (typeData && (typeData.affiliations.find((a) => a.id === tr.affiliation) || {}).name) ||
      tr.affiliation;

    const pageTitle = `${typeName}${esc(tr.number)}編成（${affName}）`;

    const body = `
<h2 class="page-title">${pageTitle}</h2>
<div class="section-block">
  <span class="tag-label">編成</span>
  ${formationHtml(tr.formation)}
</div>
<div class="section-block">
  ${historyHtml(tr.history)}
</div>
<div class="section-block">
  ${photosHtml(tr.photos)}
</div>
`;
    const relOut = `${tr.company}/${tr.affiliation}/${tr.type}-${tr.number}.html`;
    writeFile(relOut, layout({
      title: pageTitle, depth: 2,
      breadcrumb: [
        { label: "ホーム", href: "index.html" },
        { label: cName, href: `${tr.company}.html` },
        { label: typeName, href: `${tr.type}.html` },
        { label: pageTitle },
      ],
      body,
    }));
  }
}

// ---------- 実行 ----------
function main() {
  buildHome();
  buildCompanyPages();
  buildTypePages();
  buildTrainPages();
  console.log(`\n完了: 会社${site.companies.length}件 / 形式${types.length}件 / 編成${trains.length}件`);
}
main();
