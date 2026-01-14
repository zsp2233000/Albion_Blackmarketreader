
# 📊 Albion Blackmarket Reader

A modern **market analytics tool** for *Albion Online* that automatically calculates and displays profitable deals (≥ 30 %) from market data and provides a clean, web-based UI with real-time charts and filters.

Live preview: [https://blackmarketreader.com](https://blackmarketreader.com) ([GitHub][1])

---

## 🚀 Features

✅ **Profit Detection**
Automatically calculates trader profits from Albion Online market data based on buy/sell prices and shows only profitable trades (≥ 30 %) ([GitHub][1])

✅ **Region Support**
US and EU region data splits (results.js / results-eu.js) ([GitHub][1])

✅ **Dashboard UI**
A clean browser interface with:

* charts,
* filters (min profit, search),
* city selection,
* region switching ([GitHub][1])

---

## 📁 Project Structure

```
Albion_Blackmarketreader/
├── .github/workflows/         # CI for data sync & merges
├── Albion_ProfitChecker/      # .NET backend + web UI bundle
│   ├── Program.cs             # data fetcher + local server
│   ├── *.cs                   # API + profit logic
│   ├── ui/                    # static site
│   │   ├── index.html         # Landing page
│   │   ├── dashboard.html     # Gated dashboard
│   │   ├── *.css              # Styles
│   │   ├── results*.js        # Market data splits
│   │   ├── avg-profit-history.json
│   │   ├── env.js             # runtime env injection
│   │   └── picture/           # images
├── items_weapons_armor.txt    # Item IDs for reference
└── README.md                  # This file
```

---

## 🧰 Tech Stack

* **Frontend:** HTML / CSS / JS (vanilla) ([GitHub][1])
* **Backend:** .NET (.cs) for data sync, hosted via GitHub Actions + Vercel ([GitHub][1])
* **Auth & DB:** Supabase (Profiles + user metadata) ([GitHub][1])
* **Deployment:** Vercel (static UI + webhooks via CI) ([GitHub][1])

---

## 📦 Environment Setup

### 🔑 Required Env Vars (Vercel)

Set these in your Vercel project settings:

```
SUPABASE_URL
SUPABASE_ANON_KEY
```

These are used to generate `env.js` at build time. ([GitHub][1])

---


## 📈 Data Sync & Workflows

* GitHub Actions automatically syncs **market data** and merges results into the repo.
* Splits data into multi-region JS files: `results.js`, `results-eu.js`, etc.
* History for charts stored in `avg-profit-history.json` ([GitHub][1])

---

## 🧠 Features / Thoughts

✅ Automated daily sync
✅ Profit filtering logic
✅ Region + city data
✅ Supabase auth gating
✅ Dashboard with charts + filters

---

## 📬 Support

Use the GitHub Issues if you have questions or feature requests.
For auth / general support, the app UI references: `blackmarketreader@gmail.com` ([GitHub][1])

Discord for Support: https://discord.gg/HF2Ctg73m5 

---

## 📜 License

Disclaimer

This software is provided “as is”, without warranty of any kind.
No guarantees are given, either express or implied, including but not limited to merchantability or fitness for a particular purpose.

In no event shall the author be liable for any damages, data loss, or other issues arising directly or indirectly from the use of this software, regardless of whether such liability arises from contract, negligence, or any other legal theory.

---

## ⭐ Attribution

Albion Blackmarketreader pulls data from public Albion Online Market APIs and visualizes it for easy profit inspection.
Not affiliated with Albion Online / Sandbox Interactive.
