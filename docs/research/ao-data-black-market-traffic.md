# ao-data 如何擷取 Albion Online 黑市流量

研究日期：2026-07-28

## 範圍與版本

本文件只以一手來源為依據：`ao-data/albiondata-client` 與
`ao-data/albiondata-server-rails` 的原始碼，以及本 repository 的實作與本機實測。
由於 repo 原本只有 `docs/agents/`，沒有既有 research/notes 慣例，因此本文放在
`docs/research/`。

固定參考版本：

- client：[`1c7dae9ed50339172cb23392b47a074a8c6dd306`](https://github.com/ao-data/albiondata-client/tree/1c7dae9ed50339172cb23392b47a074a8c6dd306)
- server：[`7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7`](https://github.com/ao-data/albiondata-server-rails/tree/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7)

## 結論先行

黑市沒有另一套封包格式，也沒有「黑市專用 event」。ao-data 被動監聽玩家操作
市場 UI 時，遊戲在 Photon 連線上產生的 `AuctionGetOffers`（81）及
`AuctionGetRequests`（82）operation response。它用 Join/cluster operation 維護玩家
當前 location；一般城市及黑市訂單 JSON 的 `LocationId` 若為空，便以此 state 補值。
後端把 Black Market 正規化為 `3003`，而 Caerleon 一般市場是 `3005`。
因此「先取得正確 location，再解析市場 response」是黑市辨識的必要鏈路，而不是只看
市場 opcode 或期待訂單 JSON 自帶 `3003`。

完整路徑如下：

```text
所有實體網卡
  -> libpcap / port 5056
  -> Photon header、reliable/unreliable/fragment
  -> OperationResponse 81/82
  -> params[0] 的 JSON string array
  -> 用 state.LocationId 補空 LocationId
  -> MarketUpload / marketorders.ingest
  -> realm-specific PoW HTTP endpoint
  -> Rails PowController
  -> location normalize + Redis dedupe + price / 10000
  -> NATS deduped topics + realm DB upsert
```

## 1. 封包擷取層

client 先列舉實體網卡，然後在**每一張**實體網卡建立 listener；listener 只鎖定 port
`5056`。[`albion_watcher.go#L25-L44`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/albion_watcher.go#L25-L44)
[`albion_watcher.go#L63-L72`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/albion_watcher.go#L63-L72)

每個 listener 用 libpcap `OpenLive(device, 2048, false, BlockForever)` 開啟，並設
`tcp port 5056 || udp port 5056` BPF。收到 IPv4 packet 後，它取 UDP 或 TCP payload，
交給 Photon parser；同時把封包 `SrcIP` 記為 `GameServerIP`。
[`listener.go#L39-L55`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/listener.go#L39-L55)
[`listener.go#L140-L175`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/listener.go#L140-L175)

這是純被動擷取；client 並不代替玩家送市場查詢。能取得哪些黑市訂單，取決於玩家在
黑市 UI 實際載入了哪些頁面／篩選結果。README 也將 client 描述為監看本機流量、
辨識 Albion UDP packet 並上傳資料。
[`README.md#L231-L241`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/README.md#L231-L241)

## 2. Photon 解碼

Photon packet header 是 12 bytes。parser 讀 peer ID、flags、command count，略過
timestamp/challenge，再依 command count 處理 command。
[`parser.go#L8-L12`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L8-L12)
[`parser.go#L78-L107`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L78-L107)

它處理 Photon command type：

- `4`：disconnect
- `6`：send reliable
- `7`：send unreliable；先跳過額外 4 bytes，再走同一 message decoder
- `8`：fragment；按 start sequence、total length 與 fragment offset 重組，完成後再走
  reliable decoder

來源：
[`parser.go#L14-L20`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L14-L20)
[`parser.go#L109-L150`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L109-L150)
[`parser.go#L249-L294`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L249-L294)

可靠訊息內的 message type 是 request `2`、response `3`（也接受 Albion alternate
`7`）、event `4`；`131` 代表 encrypted。request/event 的第一 byte 是 operation/event
code，後面是 Protocol18 parameter table；response 則是 opcode、little-endian return
code、debug value、parameter table。
[`parser.go#L22-L31`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L22-L31)
[`parser.go#L153-L185`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L153-L185)
[`parser.go#L190-L247`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L190-L247)

若 packet flags 是 `1` 或 message type 是 `131`，client 不解密，只通知「market data is
encrypted」。
[`parser.go#L85-L97`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L85-L97)
[`listener.go#L178-L183`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/listener.go#L178-L183)

## 3. 市場 operation，而非黑市 event

operation enum 的固定值是：

- `AuctionGetOffers = 81`
- `AuctionGetRequests = 82`

[`operations.go#L93-L103`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operations.go#L93-L103)

`AuctionGetOffers` request 只把 `WaitingForMarketData` 設為 true；response 從
`params[0]` 取得 JSON 字串陣列，轉成 sell/offer orders。
[`operation_auction_get_offers.go#L12-L34`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_auction_get_offers.go#L12-L34)
[`operation_auction_get_offers.go#L40-L92`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_auction_get_offers.go#L40-L92)

`AuctionGetRequests` response 同樣解析 `params[0]`，產生 buy/request orders。
[`operation_auction_get_requests.go#L11-L46`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_auction_get_requests.go#L11-L46)

目前 client 還有一個因應 protocol 漂移的重要 heuristic：若 response 原應是 debug
value 的位置解出 `[]string`，parser 直接把它放到 `params[0]`；listener 看到
`params[0]` 是 `[]string`，會強制 route 成 `AuctionGetOffers`。這代表 response opcode
在新版封包上可能不可靠；ao-data 最後仍反序列化 JSON 內的 `AuctionType`，所以訂單
本身的 `"offer"` / `"request"` 才是買賣方向的可靠來源。
[`parser.go#L201-L235`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/photon/parser.go#L201-L235)
[`listener.go#L207-L245`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/listener.go#L207-L245)
[`market.go#L5-L17`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/lib/market.go#L5-L17)

## 4. location：Black Market 與 Caerleon 是不同市場

client 的 location state 主要由兩個 operation 更新：

- `JoinResponse` 的 parameter `8`
- `GetGameServerByCluster` 的 parameter `0`

[`operation_join.go#L8-L14`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_join.go#L8-L14)
[`operation_join.go#L19-L42`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_join.go#L19-L42)
[`operation_get_game_server_by_cluster.go#L7-L20`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_get_game_server_by_cluster.go#L7-L20)

一般城市市場（黑市亦同）回傳的 order JSON 常沒有 location；ao-data 在
`order.LocationID == ""` 時用 `state.LocationId` 補上。只有 Rest/Smuggler 等 JSON
已帶 `@...` location 的訂單會保留自身值。
[`operation_auction_get_offers.go#L50-L79`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_auction_get_offers.go#L50-L79)
[`operation_auction_get_requests.go#L15-L33`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/operation_auction_get_requests.go#L15-L33)

Rails 的 canonical location 明確分開：

- Black Market：`3003`
- Caerleon 一般市場：`3005`

[`location.rb#L4-L29`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/lib/location.rb#L4-L29)

後端接受並正規化純數字、`*-Auction2`、`*-HellDen`、`@...` 與 `BLACKBANK-*`；
不在有效清單內的 location 會變成 `nil`，該 order 隨後被丟棄。
[`location.rb#L104-L132`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/lib/location.rb#L104-L132)
[`market_order_dedupe_service.rb#L11-L28`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/services/market_order_dedupe_service.rb#L11-L28)

所以黑市判定不是「Caerleon realm/location」的近似判定，也不能硬性期待每一筆 JSON
自帶 `3003`；必須同步解碼 Join/cluster state，再把它套到空 location order。

## 5. realm／region 與資料上傳

realm 和 market location 是兩個不同維度。client 依 inbound packet 的 source IP
prefix 選資料 realm：

| Source IP prefix | realm | client server ID | PoW host |
|---|---|---:|---|
| `5.188.125.*` | West | 1 | `pow.west.albion-online-data.com` |
| `5.45.187.*` | East / Asia | 2 | `pow.east.albion-online-data.com` |
| `193.169.238.*` | Europe | 3 | `pow.europe.albion-online-data.com` |

[`albion_state.go#L69-L108`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/albion_state.go#L69-L108)

public ingest 的 placeholder 會在送出前替換成 state 內的 realm-specific URL。
兩種市場 response 都包成 `MarketUpload{Orders: ...}`，topic 都是
`marketorders.ingest`。
[`dispatcher.go#L55-L73`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/dispatcher.go#L55-L73)
[`market.go#L82-L85`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/lib/market.go#L82-L85)
[`nats.go#L3-L11`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/lib/nats.go#L3-L11)

官方 path 使用 PoW uploader：先 `GET /pow` 取 challenge，解題後
`POST /pow/marketorders.ingest`，form 包含 `key`、`solution`、`serverid`、
`natsmsg`、`identifier`。
[`uploader_http_pow.go#L51-L83`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/uploader_http_pow.go#L51-L83)
[`uploader_http_pow.go#L85-L113`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/uploader_http_pow.go#L85-L113)
[`uploader_http_pow.go#L174-L178`](https://github.com/ao-data/albiondata-client/blob/1c7dae9ed50339172cb23392b47a074a8c6dd306/client/uploader_http_pow.go#L174-L178)

Rails 的實際 `server_id` 取自 request subdomain，不取 POST 的 `serverid`。
因此資料最後進 East 或 Europe DB，真正由 client 選到哪一個 `pow.*` host 決定；若
Asia 封包被誤判成 Europe 並送到 `pow.europe`，form 內即使帶 `serverid=2` 也不會修正。
[`application_controller.rb#L9-L16`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/controllers/application_controller.rb#L9-L16)

## 6. Rails ingest、去重與落庫

Rails 以 `/pow/:topic` 接受 POST，驗證 topic、PoW、payload 大小與 JSON；一批
market orders 最多 50 筆，成功後 enqueue `MarketOrderDedupeWorker`。
[`routes.rb#L31-L32`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/config/routes.rb#L31-L32)
[`pow_controller.rb#L51-L122`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/controllers/pow_controller.rb#L51-L122)
[`pow_controller.rb#L153-L181`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/controllers/pow_controller.rb#L153-L181)

`MarketOrderDedupeService` 的處理順序是：

1. 正規化 location，丟棄無效 location。
2. 把有效原始資料發布到 NATS `marketorders.ingest`。
3. 以整筆 order 的 SHA-256 在 realm-specific Redis 做 10 分鐘去重。
4. 將 `UnitPriceSilver` **除以 10,000**。
5. 發布單筆 `marketorders.deduped` 與批次 `marketorders.deduped.bulk`。
6. enqueue processor worker。

[`market_order_dedupe_service.rb#L11-L56`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/services/market_order_dedupe_service.rb#L11-L56)
[`market_order_dedupe_service.rb#L59-L100`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/services/market_order_dedupe_service.rb#L59-L100)

processor 依 realm 切 DB；黑市的「永不過期」遠期日期會改成目前時間加一個月，最後
以 `upsert_all` 寫入 market orders。
[`market_order_processor_service.rb#L1-L8`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/services/market_order_processor_service.rb#L1-L8)
[`market_order_processor_service.rb#L21-L49`](https://github.com/ao-data/albiondata-server-rails/blob/7cf209ce3a0ae22d8a43e2688ccf6a1ba1bf2ad7/app/services/market_order_processor_service.rb#L21-L49)

## 7. 與本專案目前實作的關鍵差異

> 本節記錄研究開始時的 baseline，作為修正前後對照；本次實作已處理 7.1、7.3、7.4、
> 7.6 與 7.7 的解析／telemetry 缺口，7.2（多網卡選擇）仍是後續可獨立處理的項目。

### 7.1 空 `LocationId` 會被直接拒絕

修正前本專案 `AlbionMarketPhotonParser` 沒有追蹤 Join/cluster location state。它把 order JSON
直接反序列化，隨即要求 DTO 的 `LocationId` 通過 Black Market 規則；空字串會失敗。
[`AlbionMarketPhotonParser.cs#L67-L105`](../../Albion_ProfitChecker/Services/AlbionMarketPhotonParser.cs#L67-L105)
[`AlbionMarketPhotonParser.cs#L186-L213`](../../Albion_ProfitChecker/Services/AlbionMarketPhotonParser.cs#L186-L213)

這和 ao-data「JSON location 空白時使用 `state.LocationId`」的設計正好相反，是目前
`ParsedOrderCount` 可能一直為 0 的第一個紅燈。

### 7.2 只開一張網卡

本專案沒有指定 device 時，只取第一張非 loopback 網卡，接著只對該 device 啟動
capture。
[`BlackMarketCaptureService.cs#L90-L103`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L90-L103)
[`BlackMarketCaptureService.cs#L133-L153`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L133-L153)

ao-data 則對所有實體網卡各開 listener。若第一張非 loopback 並不是 Albion 實際走的
Wi-Fi/Ethernet/VPN adapter，本專案完全看不到遊戲封包。

### 7.3 用 response opcode 推導 `AuctionType`

修正前本專案 DTO 沒有 `AuctionType` 欄位；`OnResponse` 只接受 opcode 81/82，並以 opcode
直接推導 `"offer"` / `"request"`。
[`AlbionMarketPhotonParser.cs#L41-L59`](../../Albion_ProfitChecker/Services/AlbionMarketPhotonParser.cs#L41-L59)
[`AlbionMarketPhotonParser.cs#L186-L196`](../../Albion_ProfitChecker/Services/AlbionMarketPhotonParser.cs#L186-L196)

ao-data 新版遇到 `params[0] == []string` 會強制 route 為 Offers，但仍保留 JSON 內
`AuctionType`。因此本專案若遇到同一種 opcode／response 格式漂移，可能整批拒絕，或
把黑市 buy requests 誤標為 offers；應以 JSON 欄位為準，opcode 只用來辨識候選 response。

### 7.4 缺少價格縮放

修正前本專案把 DTO 的 `UnitPriceSilver` 原值直接寫進 `BlackMarketOrder`，沒有 `/ 10000`。
[`AlbionMarketPhotonParser.cs#L90-L105`](../../Albion_ProfitChecker/Services/AlbionMarketPhotonParser.cs#L90-L105)

ao-data Rails 明確在 dedupe 階段做 `order['UnitPriceSilver'] /= 10000`。所以即使本專案
成功解析，價格仍可能是實際銀價的 10,000 倍。

### 7.5 本機目前沒有可用的 Npcap runtime

本次在 Windows 執行：

```powershell
dotnet run --project Albion_ProfitChecker -- --list-capture-devices
```

實際得到 `wpcap.dll` 載入失敗（`0x8007007E`），且系統查無 Npcap。這發生在 Photon
parser 之前：SharpPcap 無法列舉 device，就不可能收到任何 market packet。程式本身也
在 device list 為空或載入失敗時回報需安裝 Npcap／WinPcap compatibility mode。
[`BlackMarketCaptureService.cs#L67-L79`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L67-L79)
[`BlackMarketCaptureService.cs#L90-L108`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L90-L108)

### 7.6 手動指定 Asia 仍可能被跨區安全邏輯永久阻擋

修正前本專案雖把手動 region 當成解析時的 authoritative region，但仍先記錄 endpoint 推導出的
`_detectedRegion`；同一個 capture 只要之後出現另一個推導值，就會把 `_blocked` 設為
`true`。因此先被錯判為 Europe、稍後又看到 Asia 的情況，仍會停止 capture。現有測試
`StopsWhenEndpointRegionChangesDuringCapture` 更把這個行為固定成目前契約。
[`BlackMarketCaptureService.cs#L185-L207`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L185-L207)
[`BlackMarketCaptureTests.cs#L92-L110`](../../Albion_ProfitChecker.Tests/Services/BlackMarketCaptureTests.cs#L92-L110)

ao-data 不會因偵測值改變而永久停止 listener；它從已知 Albion source-IP prefix 更新
realm/ingest state。若手動 region 的目的正是避免過時 endpoint 資料誤判，目前的
`_blocked` 邏輯仍與該目的衝突。

### 7.7 capture 範圍與 telemetry 無法定位掉包層級

ao-data 的 BPF 同時接收 TCP/UDP 5056；修正前本專案只抽取 UDP，且沒有在 capture device 上
設定 BPF。現行實作已加入 TCP/UDP 5055/5056 filter、per-flow TCP Photon frame reassembly，
並分別統計 matched、Photon accepted、encrypted 與 parsed 訂單數。`CapturedPacketCount` 在檢查
UDP 與 Albion port 之前就遞增，所以數字增加只
代表網卡有任意封包，不代表收到 Albion payload。另一方面，`Photon18Parser` 遇到
encrypted 或格式錯誤時多半只回傳 `false`，`ProcessCapturedPayload` 又忽略該回傳值，
狀態頁因而無法區分「錯網卡、非 Albion、Photon 拒絕、encrypted、location 拒絕」。
[`BlackMarketCaptureService.cs#L155-L177`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L155-L177)
[`BlackMarketCaptureService.cs#L210-L215`](../../Albion_ProfitChecker/Services/BlackMarketCaptureService.cs#L210-L215)
[`Photon18Parser.cs#L22-L58`](../../Albion_ProfitChecker/Services/Photon18Parser.cs#L22-L58)

## 8. 對修正工作的直接含意

依風險與阻塞程度，應先處理：

1. 安裝並驗證 Npcap（含 WinPcap compatibility mode），讓
   `--list-capture-devices` 真正列出 adapter。
2. 像 ao-data 一樣監聽所有可用實體 adapter，或要求使用者明確選擇實際承載 Albion
   流量的 adapter；對 5056 設定 TCP/UDP BPF。
3. 在同一 Photon stream 解析 Join response / `GetGameServerByCluster`，維護
   `currentLocationId`；market order 的 location 空白時以此補值，再判斷是否為 `3003`。
4. 支援 ao-data 現有的 response heuristic：市場 JSON string array 可能出現在 debug
   value 位置；不要只信原始 response opcode。
5. 反序列化並信任 JSON `AuctionType`，不要由 opcode 單獨推導。
6. 在進入 order book 前把 `UnitPriceSilver` 除以 10,000，並用 fixture 驗證縮放。
7. region 只接受已確認的 Albion source-IP prefix；Asia 應匹配 `5.45.187.*`，且未知
   IP 不應覆蓋既有 realm state。
8. 手動 region 啟用時，不要再因 advisory endpoint 分類漂移而永久 `_blocked`；真正
   的跨 realm 安全策略應以已確認的 game-server flow 為單位。
9. 分開計數 captured、port-matched、Photon-accepted、encrypted、market-response、
   location-rejected 與 parsed-order，並保留一份真實 pcap/raw-payload replay fixture。

這些修正分別對應「完全無封包」、「抓錯網卡」、「空 location 全拒絕」、「新版市場
response 無法 route」、「買賣方向錯誤」、「價格放大 10,000 倍」、「Asia 誤送 Europe」、
「安全邏輯誤停」與「狀態數字無法指出掉包層級」等不同故障，應在診斷 telemetry 中
分開計數。
