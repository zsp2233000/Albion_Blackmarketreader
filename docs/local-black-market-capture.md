# 本機黑市資料擷取操作說明

此功能限定在本機執行，並且只進行被動擷取。擷取器會讀取遊戲已經正常接收的 Albion UDP 流量，解析黑市市場訂單回應，並以 JSON 保存目前訂單狀態。它不會送出、修改、重播或主動要求任何遊戲封包。

## 使用前準備

1. 安裝 .NET 8 SDK／Runtime。
2. 安裝 Npcap，並啟用 WinPcap 相容模式。
3. 啟動遊戲，至少開啟一次黑市，讓遊戲客戶端實際接收到黑市資料。

如果 Npcap 不存在、網路介面無法開啟、封包無法解析，或無法確認區域／地點，擷取器會繼續提供既有的 API／靜態資料，不會寫入不確定的本機黑市資料。

## 啟動本機擷取

請從 `Albion_ProfitChecker/` 目錄執行，因為既有本機伺服器會以目前工作目錄尋找 `ui/` 路徑：

```powershell
dotnet run -- --list-capture-devices
dotnet run -- --capture-device 0
```

程式會依 Albion 遊戲伺服器 IP 自動判斷區域。如果伺服器 IP 無法判斷，也可以手動指定：

```powershell
dotnet run -- --capture-device 0 --region eu
```

如果自動判斷的區域與 `--region` 不一致，程式會停止寫入，以避免資料被寫入錯誤區域。本機訂單狀態預設保存於：

```text
%LOCALAPPDATA%\AlbionBlackmarketReader\black-market-orders.json
```

只有需要改用其他本機專用路徑時，才使用 `--local-orders <path>`。建議不要把本機訂單檔案放在 Git 儲存庫內。

開啟 `http://localhost:5173/bm-crafter`。在 localhost 上，頁面會優先讀取本機黑市資料投影；按瀏覽器 F5 才是手動更新方式。重新整理不會啟動 API pipeline，也不會自動輪詢。每個項目會顯示 `Local` 或 `API` 來源與觀測時間，並可使用 Data Source 篩選資料列。

本機價格必須同時符合以下條件，才會納入計算：數量為正、價格為正、訂單尚未到期、確實屬於黑市、最後觀測時間在一小時內，且品質為 Normal、Good 或 Outstanding。五種品質都會保留在本機 JSON 中；Excellent 與 Masterpiece 會被保存，但不納入黑市價格計算。`sold/day` 仍然使用既有 API 快照資料。

## 手動發布資料快照

發布操作會以目前 Git 中已存在的 `bm-crafter-{region}.json` 作為基礎，只覆蓋一小時內有效的本機價格。它不會呼叫 API、不會自動 commit，也不會自動 push：

```powershell
dotnet run -- --publish-local --region eu
```

執行後請先檢查變更的 `ui/public/data/bm-crafter-eu.json`，確認無誤後，再自行決定是否手動 commit 與 push。這次 push 可能會觸發既有的 Vercel 部署；擷取器本身不會因為每個封包而自動 push。
