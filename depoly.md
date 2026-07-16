# Albion Blackmarket Reader 部署手冊

本文件涵蓋本機驗證、Vercel 部署、GitHub Actions 資料更新與 Production 上線。

## 1. 本機驗證

前端 `package.json` 位於 `Albion_ProfitChecker/ui`：

```powershell
cd C:\Users\Work\Documents\Code\Albion_Blackmarketreader\Albion_ProfitChecker\ui
```

安裝固定版本依賴：

```powershell
npm ci
```

執行測試：

```powershell
npm test
```

建立 production bundle：

```powershell
npm run build
```

`npm run build` 會執行 TypeScript 檢查、Vite 打包與 SEO prerender，輸出至 `ui/dist`。

啟動開發伺服器：

```powershell
npm run dev
```

通常開啟 `http://localhost:5173`。

預覽 production bundle：

```powershell
npm run preview
```

`preview` 不會重新 build；修改程式後需再次執行 `npm run build`。

## 2. Git 分支與推送

回到 repository 根目錄：

```powershell
cd C:\Users\Work\Documents\Code\Albion_Blackmarketreader
```

查看狀態：

```powershell
git status
git branch --show-current
```

建立功能分支（只需第一次執行）：

```powershell
git switch -c feature/asia-market-data
```

加入修改、建立 commit、推送遠端：

```powershell
git add .
git commit -m "feat: add asia market data"
git push -u origin feature/asia-market-data
```

用途：

- `git add .`：將修改加入 staging。
- `git commit`：建立本地 Git 歷史。
- `git push -u`：首次推送功能分支並設定 upstream。

## 3. Vercel 部署

repository 根目錄已有 `vercel.json`。Vercel Project Root 必須保持 repository 根目錄，不要改成 `Albion_ProfitChecker/ui`。

Vercel 會使用：

```text
Install: npm install
Build:   cd Albion_ProfitChecker/ui && npm run build
Output:  Albion_ProfitChecker/ui/dist
```

建立專案：

1. Vercel → **New Project**。
2. 匯入 GitHub repository。
3. Root Directory 保持 repository 根目錄。
4. 確認使用 repository 的 `vercel.json`。
5. Deploy。

推送功能分支會產生 Preview Deployment；推送 `main` 會產生 Production Deployment。

## 4. 環境變數

前端載入 `Albion_ProfitChecker/ui/public/env.js`。格式參考 `env.example.js`：

```js
window.env = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY"
};
```

前端直接讀取 `/env.js`。只在 Vercel 設定同名環境變數，不會自動建立這個檔案；更換 Supabase 專案時需同步更新 `public/env.js`。

Vercel API routes 使用：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
SITE_URL
```

安全規則：

- `SUPABASE_ANON_KEY` 可出現在前端。
- `SUPABASE_SERVICE_ROLE_KEY`、Stripe secret 不可放入 `public/env.js`。
- Secret 只放 Vercel Environment Variables 或 GitHub Secrets。

## 5. GitHub Actions 資料更新

Asia AOD host：

```text
https://east.albion-online-data.com/api/v2/stats
```

GitHub → **Actions** → 選 workflow → **Run workflow**，選擇要更新的 branch。

建議順序：

1. `Black Market Data (US + EU + Asia)`
2. `Build Crafting Prices (US + EU + Asia)`
3. `Build Material Prices by City (US + EU + Asia)`
4. `Food and Potion Prices (US + EU + Asia)`
5. `Journal Prices (US + EU + Asia)`
6. `daily-avg-history`

Workflow 會以 US/EU/Asia matrix 抓取資料，再由 publisher job 驗證、合併與單次 commit/push。

常見 Asia 產物：

```text
ui/public/results-asia-1.js
ui/public/results-asia-2.js
ui/public/data/bm-crafter-asia.json
ui/public/data/materials-asia.json
ui/public/data/materials-cities-asia.json
ui/public/data/artefacts-asia.json
ui/public/data/journals-asia.json
```

若 Actions 無法 push：GitHub → Settings → Actions → General → Workflow permissions，選擇 **Read and write permissions**。

## 6. Production 上線

Preview 驗證完成後：

```powershell
cd C:\Users\Work\Documents\Code\Albion_Blackmarketreader
git switch main
git pull --ff-only
git merge feature/asia-market-data
git push origin main
```

用途：

- `git switch main`：切回 production 分支。
- `git pull --ff-only`：取得遠端最新版本，不自動產生 merge commit。
- `git merge ...`：合併功能分支。
- `git push origin main`：推送 production，觸發 Vercel 正式部署。

## 7. Vercel Deploy Hook（可選）

若需要由 GitHub Actions 主動觸發 Vercel，設定 GitHub Secret：

```text
VERCEL_DEPLOY_HOOK_URL
```

沒有此 Secret 時，資料 workflow 仍會 commit；若 Vercel 已連接 GitHub，Git push 通常會自動觸發部署。

## 8. 常見問題

### `Missing script: "dev"`

在錯誤目錄執行 npm。切換至 `Albion_ProfitChecker/ui`：

```powershell
cd Albion_ProfitChecker/ui
npm run dev
```

### Asia 顯示 404 或沒有資料

目前功能分支不包含首批 Asia 快照。先手動執行 Asia workflow，產生 `*-asia.json` 後重新部署。

### Vercel 找不到 build 路徑

確認 Project Root 是 repository 根目錄；`vercel.json` 會自行進入 `Albion_ProfitChecker/ui`。

### 登入失敗

確認 `public/env.js` 的 Supabase URL、anon key，以及 Supabase Auth 的正式網域/Preview 網域 Redirect URL。

### Stripe 付款失敗

確認 Vercel 已設定 Stripe、Supabase service-role 變數，且 Stripe webhook 指向：

```text
/api/stripe/webhook
```
