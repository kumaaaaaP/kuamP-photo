#!/usr/bin/env node
/**
 * くまP撮影記録 — 静的サイトジェネレーター
 *
 * data/site.json          … サイト名・会社一覧（ジャンル分け・並び順を含む）
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
const site = readJSON(path.join(DATA, "site.json"), { siteName: "くまP撮影記録", genres: [], companies: [] });
const latest = readJSON(path.join(DATA, "latest.json"), []);
const types = listJSONFiles(path.join(DATA, "types")).map((f) => readJSON(f));
const trains = listJSONFiles(path.join(DATA, "trains")).map((f) => readJSON(f));

const trainByKey = new Map();
for (const t of trains) trainByKey.set(`${t.type}-${t.number}`, t);

function companyName(id) {
  const c = site.companies.find((c) => c.id === id);
  return c ? c.name : id;
}

// 形式が属する会社ID一覧を返す（companies配列 / company単数 どちらの形式にも対応）
function typeCompanies(t) {
  if (Array.isArray(t.companies) && t.companies.length) return t.companies;
  if (t.company) return [t.company];
  return [];
}
// 所属(affiliation)が属する会社IDを返す（affiliation側にcompanyが無ければ形式側の値にフォールバック）
function affCompany(t, aff) {
  return aff.company || t.company || typeCompanies(t)[0];
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
<meta name="format-detection" content="telephone=no">
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
  const genres = site.genres || [];
  const companyCard = (c) => `<a class="company-card" href="${esc(c.id)}.html">${esc(c.name)}</a>`;

  let companySection;
  if (!genres.length) {
    // ジャンル未設定の場合は従来通り単一リスト
    const companyItems = site.companies.map(companyCard).join("\n");
    companySection = `<div class="section-block">
  <span class="tag-label">会社一覧</span>
  <div class="company-list">
    ${companyItems || "<p>まだ会社が登録されていません。</p>"}
  </div>
</div>`;
  } else {
    const genreBlocks = genres
      .map((g) => {
        const comps = site.companies.filter((c) => c.genre === g.id);
        if (!comps.length) return "";
        return `<div class="section-block">
  <span class="tag-label">${esc(g.name)}</span>
  <div class="company-list">
    ${comps.map(companyCard).join("\n")}
  </div>
</div>`;
      })
      .join("\n");
    const unassigned = site.companies.filter((c) => !c.genre || !genres.find((g) => g.id === c.genre));
    const unassignedBlock = unassigned.length
      ? `<div class="section-block">
  <span class="tag-label">その他</span>
  <div class="company-list">
    ${unassigned.map(companyCard).join("\n")}
  </div>
</div>`
      : "";
    companySection = genreBlocks + "\n" + unassignedBlock;
  }

  const latestItems = latest
    .slice(0, 12)
    .map((p) => `<figure>
  <img src="${esc(p.src)}" alt="${esc(p.caption || "")}" loading="lazy">
  <figcaption>${esc(p.caption || "")}</figcaption>
</figure>`)
    .join("\n");

  const body = `
<h2 class="page-title">くまP撮影記録</h2>
${companySection}
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
    const companyTypes = types.filter((t) => typeCompanies(t).includes(c.id));
    const byAffiliation = new Map();
    for (const t of companyTypes) {
      for (const aff of t.affiliations || []) {
        if (affCompany(t, aff) !== c.id) continue; // その会社の所属だけを表示
        if (!byAffiliation.has(aff.id)) byAffiliation.set(aff.id, { name: aff.name, types: [] });
        byAffiliation.get(aff.id).types.push({ id: t.id, name: t.name });
      }
    }

    // 会社ごとに設定された affiliationOrder（並び替えタブで保存）に従って並べ替える
    const order = c.affiliationOrder || [];
    const sortedAffiliations = [...byAffiliation.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });

    const blocks = sortedAffiliations
      .map(([, a]) => `<div class="affiliation-block">
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
    const companies = typeCompanies(t).map((id) => ({ id, name: companyName(id) }));
    const primaryCompany = companies[0] || { id: "", name: "" };
    const multiCompany = companies.length > 1;

    const companyLine = multiCompany
      ? `<p style="font-size:.85rem;color:#666;">所属会社: ${companies
          .map((c) => `<a href="${esc(c.id)}.html">${esc(c.name)}</a>`)
          .join(" / ")}</p>`
      : "";

    const affTabs = (t.affiliations || [])
      .map((aff, i) => `<button type="button" class="aff-tab-btn${i === 0 ? " active" : ""}" data-target="aff-${esc(aff.id)}">${esc(aff.name)}</button>`)
      .join("\n    ");

    const affiliationBlocks = (t.affiliations || [])
      .map((aff, i) => {
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
        const affHeading = multiCompany
          ? `${esc(aff.name)}（${esc(companyName(affCompany(t, aff)))}）`
          : esc(aff.name);
        return `<div class="affiliation-block tab-panel" id="aff-${esc(aff.id)}"${i === 0 ? "" : " hidden"}>
  <h3>${affHeading}</h3>
  ${groupBlocks}
</div>`;
      })
      .join("\n");

    const body = `
<h2 class="page-title">${esc(t.name)}</h2>
${companyLine}
${t.description ? `<p>${esc(t.description)}</p>` : ""}
${t.affiliations && t.affiliations.length ? `<div class="aff-tabs">\n    ${affTabs}\n  </div>` : ""}
${affiliationBlocks || "<p>まだ編成が登録されていません。</p>"}

<div class="legend">
  <span><span class="swatch" style="background:#e6f0ff;border-color:#b7d3f7"></span>撮影済み</span>
  <span><span class="swatch" style="background:#fff"></span>未撮影</span>
  <span><span class="swatch" style="background:#e5e5e5"></span>非現存</span>
</div>
<script>
document.querySelectorAll(".aff-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aff-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.hidden = true);
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).hidden = false;
  });
});
</script>
`;
    writeFile(`${t.id}.html`, layout({
      title: t.name, depth: 0,
      breadcrumb: [
        { label: "ホーム", href: "index.html" },
        { label: primaryCompany.name, href: `${primaryCompany.id}.html` },
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
    <div class="history-detail">${esc(h.date || "")}</div>
    ${h.note ? `<div class="history-note">${esc(h.note)}</div>` : ""}
  </div>`)
    .join("\n");
}

// "2026年5月24日" のような文字列を比較可能な数値 (20260524) に変換する。
// 日付が無い/解釈できない写真は末尾に回す。
function parseDateForSort(str) {
  if (!str) return Infinity;
  const m = String(str).match(/(\d{4}).*?(\d{1,2}).*?(\d{1,2})/);
  if (!m) return Infinity;
  const [, y, mo, d] = m;
  return Number(y) * 10000 + Number(mo).toString().padStart(2, "0") * 100 + Number(d);
}

function photosHtml(photos) {
  if (!Array.isArray(photos) || !photos.length) {
    return `<p class="no-formation-note">写真はまだ登録されていません。</p>`;
  }
  const sortedPhotos = [...photos].sort(
    (a, b) => parseDateForSort(a.date) - parseDateForSort(b.date)
  );
  const cells = sortedPhotos
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

    // tr.title が指定されていればそれをそのまま使う（EF65 1128（下関）、阪急1300系1301F など自由記述）
    // 無指定の場合のみ、従来通り「形式名＋番号＋編成（所属）」の定型で組み立てる
    const pageTitle = tr.title
      ? esc(tr.title)
      : `${typeName}${esc(tr.number)}編成（${affName}）`;


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
