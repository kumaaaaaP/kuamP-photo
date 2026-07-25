# くまP撮影記録

鉄道写真・編成記録・車歴・車両配置を管理する GitHub Pages サイトです。
更新は「GitHubへ画像をアップロード」→「`setting.html` から入力」だけで完結します。

## 全体構成

```
kumaP-photo/
├── index.html, {company}.html, {type}.html,   ← 自動生成される静的ページ（手で編集しない）
│   {company}/{affiliation}/{type}-{number}.html
├── setting.html            ← 管理画面（これを開いて操作する）
├── assets/style.css        ← 共通デザイン
├── data/
│   ├── site.json           ← サイト名・会社一覧
│   ├── latest.json         ← ホームの「最新更新画像」
│   ├── types/*.json        ← 形式ページのデータ
│   └── trains/*.json       ← 編成ページのデータ（このファイルが存在する＝撮影済み）
├── image/                  ← アップロードされた画像（WebP）
├── scripts/generate.js     ← data/ から HTML を生成する Node スクリプト
└── .github/workflows/build.yml  ← data/ が変更されたら自動でページを再生成・公開
```

### 仕組み

1. `setting.html` を開き、パスワード（`652127`）を入力する。
2. GitHub の「オーナー名・リポジトリ名・Personal Access Token」を一度だけ入力する（ブラウザ内にのみ保存）。
3. フォームに入力して保存すると、`setting.html` が **GitHub の Contents API を直接呼び出して** `data/*.json` や `image/*.webp` をリポジトリへコミットする。
4. それをきっかけに GitHub Actions（`build.yml`）が起動し、`node scripts/generate.js` を実行して全ページを再生成し、GitHub Pages へ公開する。

サーバーは不要。GitHub だけで完結する。

---

## 初期セットアップ（最初の1回だけ）

1. このフォルダの中身をそのまま GitHub リポジトリのルートにコミット＆プッシュする。
2. リポジトリの **Settings → Pages** で、Source を「GitHub Actions」にする。
3. リポジトリの **Settings → Actions → General → Workflow permissions** で
   「Read and write permissions」を選択する（`build.yml` が生成物をコミットするため）。
4. GitHub の **Settings → Developer settings → Personal access tokens** で
   `repo` スコープ（Fine-grained の場合は対象リポジトリの Contents: Read and write）を持つトークンを発行する。
5. `setting.html` をブラウザで開き、パスワード → オーナー名・リポジトリ名・トークンを入力して接続確認する。

以降は `setting.html` からの操作だけでサイトを更新できる。

---

## data/ のフォーマット

### data/site.json

```json
{
  "siteName": "くまP撮影記録",
  "companies": [{ "id": "jr-west", "name": "JR西日本" }]
}
```

### data/types/{id}.json（形式ページ）

```json
{
  "id": "223",
  "name": "223系",
  "company": "jr-west",
  "description": "説明（任意）",
  "affiliations": [
    {
      "id": "aboshi",
      "name": "網干総合車両所",
      "groups": [
        { "label": "J編成", "trains": [{ "number": "J1", "active": true }] }
      ]
    }
  ]
}
```

* `active:false` の編成は「非現存」としてグレー表示される。
* 撮影済み／未撮影は **`data/trains/{id}-{number}.json` が存在するかどうかだけで自動判定される**。ここには入力しない。

### data/trains/{type}-{number}.json（編成ページ／存在＝撮影済み）

```json
{
  "type": "223", "typeName": "223系",
  "company": "jr-west", "companyName": "JR西日本",
  "affiliation": "aboshi", "affiliationName": "網干",
  "number": "J4",
  "formation": {
    "direction": "←上郡，播州赤穂　　　長浜→",
    "cars": [
      { "type": "クハ222", "number": "2063" },
      { "type": "サハ223", "number": "2149" },
      { "type": "モハ223", "number": "2030" }
    ]
  },
  "history": [
    { "event": "網干新製配置", "date": "2004年5月25日", "note": "（近車）" }
  ],
  "photos": [
    {
      "src": "image/223/J4/1.webp",
      "date": "2026年5月24日",
      "trainNumber": "791T",
      "destination": "普通 網干行き",
      "location": "南草津"
    }
  ]
}
```

* `formation` を `null` にすると「編成表なし」として省略できる（機関車・貨車向け）。
* 車歴の各項目は黄色いタグ見出し（`event`）＋日付＋備考として表示される。
* 写真は画像そのものへのリンクは張らない。撮影日・列車番号・種別行先・撮影地をメタ情報として表示する（`setting.html`でアップロード時に入力）。

### data/latest.json（ホームの最新更新画像）

配列。新しい画像ほど先頭に追加する（`setting.html` の「画像追加」が自動で行う）。

---

## 編成番号のレンジ入力

`setting.html` の「形式ページ追加」では

```
W1〜W5,W7,W10〜W16
```

のように入力すると、1件ずつ入力しなくても自動的に `W1 W2 W3 W4 W5 W7 W10 W11 ... W16` に展開される。

---

## ローカルでページ生成を試す

```bash
node scripts/generate.js
```

`data/` の内容から `index.html` などを再生成する。GitHub Actions と同じ処理。
