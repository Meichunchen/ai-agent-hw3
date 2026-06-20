# 作業 3：迷你水果知識庫（RAG + Qdrant）

## 檔案結構

```
ai-agent-hw3/
├── data/fruits.js                # ⭐ 5 筆水果資料 + fruitToText() 文字組合
├── lib/
│   ├── openai.js                 # OpenAI client
│   └── qdrant.js                 # ⭐ Qdrant client + embed() + searchFruits()
├── scripts/embed-fruits.js       # ⭐ 初始化:建集合 → embed → upsert
├── main.js                       # ⭐ 互動式搜尋(仿老師)
├── utils/spinner.js              # CLI 載入動畫
├── config.js                     # 讀 .env(三個環境變數)
├── package.json
├── .env.example / .gitignore
```

## 程式核心

### Embeddings 函數 — [`lib/qdrant.js`](./lib/qdrant.js)

```js
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

export async function embed(text) {
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}
```

### 知識庫初始化 — [`scripts/embed-fruits.js`](./scripts/embed-fruits.js)

```js
// 流程:刪舊集合 → 建新集合 → 批次 embed → 一次 upsert 5 筆
await recreateCollection();                       // dim=1536, distance=Cosine
const texts = FRUITS.map(fruitToText);           // 每筆水果組合成文字段落
const vectors = await embedBatch(texts);         // 5 筆一次 embed
const points = FRUITS.map((fruit, idx) => ({
  id: fruit.id,
  vector: vectors[idx],
  payload: { name, region, season, varieties, description }
}));
await qdrant.upsert(FRUITS_COLLECTION, { wait: true, points });
```

### 搜尋函數 — [`lib/qdrant.js`](./lib/qdrant.js)

```js
export async function searchFruits(query, limit = 5) {
  const vector = await embed(query);             // 把查詢也轉成向量
  const results = await qdrant.search(FRUITS_COLLECTION, {
    vector,
    limit,
    with_payload: true,                          // 帶回原始資料
  });
  return results.map(r => ({ score: r.score, ...r.payload }));
}
```

## 實測搜尋紀錄

執行截圖：

![水果知識庫搜尋測試截圖](./HW3.PNG)

執行 `npm start` 後，輸入以下 3 個查詢（涵蓋季節、屬性、地名三種不同語意角度）。

### 查詢 1：「冬天有什麼水果可以吃」

| 排名 | 水果 | 相似度 | 觀察 |
|---|---|---|---|
| 1 | 芒果 | **0.5368** | ⚠️ 夏季水果排第 1 |
| 2 | 芭樂 | 0.5296 | 全年產，合理 |
| 3 | 蓮霧 | 0.4618 | ✅ 真冬春水果 |
| 4 | 鳳梨 | 0.4582 | 春夏產 |
| 5 | 釋迦 | 0.4414 | ✅ 真秋冬水果 |

🔍 **觀察**：「真正冬天盛產」的水果（蓮霧、釋迦）排在 3、5 名，沒有排第 1。原因是 embedding 不是「關鍵字匹配」，而是「整段文字的語意相近度」。芒果跟芭樂的描述提到「夏季」「全年都可買到」這類季節詞，被認為跟「冬天有什麼水果」這句的整體語意接近。這是個典型的 **embedding 局限**：它分不出「季節相符」跟「季節相關但相反」的差異。

### 查詢 2：「維他命C含量作多的水果」

| 排名 | 水果 | 相似度 | 觀察 |
|---|---|---|---|
| 1 | 芭樂 | **0.4956** | ✅ 完美命中 |
| 2 | 芒果 | 0.4086 | ✅ 描述提到「維生素 A、C」 |
| 3 | 釋迦 | 0.3443 | 描述提到「維他命 C」 |
| 4 | 鳳梨 | 0.3101 | 維生素未強調 |
| 5 | 蓮霧 | 0.2364 | 完全沒提維他命 |

🔍 **觀察**：**結果排序完全符合預期**。芭樂排第 1 因為資料寫了「維他命 C 含量是柳橙的 5 倍以上」，跟查詢的語意完美對應。這證明 **描述文字寫得越具體，搜尋越準**。芒果排第 2 是因為提到「維生素 A、C」；蓮霧排第 5 因為描述完全沒提任何維生素。這是 RAG 系統中「資料品質決定搜尋品質」的最好示範。

### 查詢 3：「台中盛產什麼水果」

| 排名 | 水果 | 相似度 | 觀察 |
|---|---|---|---|
| 1 | 芒果 | **0.5436** | 產地是台南/屏東/高雄 |
| 2 | 芭樂 | 0.5422 | 產地是高雄/彰化/台南 |
| 3 | 鳳梨 | 0.5222 | 產地是屏東/嘉義/台南 |
| 4 | 釋迦 | 0.4950 | 產地是台東 |
| 5 | 蓮霧 | 0.4194 | 產地是屏東/高雄/宜蘭 |

🔍 **觀察（最有教學價值的一題）**：知識庫**根本沒有任何水果產於台中**，但系統還是回了 5 筆結果。這顯示 **語意搜尋永遠會回東西**，不會「找不到」。前 3 名分數都在 0.52–0.54，因為「產地」這個語意維度跟所有水果資料都有關（每筆都寫了產地）。

**這是 RAG 應用要特別注意的設計考量：**
- 如果做問答系統，應該設一個 **score threshold**（例如 < 0.55 視為「沒有相關資料」）
- 或者讓 LLM 看完搜尋結果後自己判斷「這些資料能不能回答問題」，能就回答、不能就說「資料庫沒有」
- 否則使用者問「台中產什麼水果」會得到「芒果產於台南」這種誤導性答案

---

## 心得

這次作業最大的學習：**語意搜尋（vector search）不是關鍵字搜尋的升級版，是另一種搜尋邏輯**。

具體說：
- **關鍵字搜尋**（傳統 SQL `LIKE '%維他命%'`）會逐字比對，沒有匹配就回 0 筆
- **語意搜尋**（vector search）會把所有資料的語意位置算一遍，找出「最像」的 K 筆 — **永遠會回 K 筆**，但分數可能很低

從 3 個實測可以看出：
1. **查詢 2（維他命 C）排序完美** — 因為資料裡的關鍵字跟查詢直接對應
2. **查詢 1（冬天）排序不完全準** — embedding 看不出「夏季」跟「冬天」的相反意涵，只看到「都是季節相關文字」
3. **查詢 3（台中）回了一堆無關結果但分數還有 0.5** — 因為「產地」是共通語意維度

學到的設計準則：
- **資料的 description 要寫具體**（提到該水果獨特的屬性，例如「維他命 C 是柳橙 5 倍」），搜尋會更準
- **score threshold 是 RAG 的必備防線**，否則會有「明明沒答案卻回了答案」的問題
- **embedding 適合做「初篩」**，不適合直接回答精準問題；通常要搭配 LLM 做「閱讀理解 + 篩選」（這就是 RAG 完整的 R+A+G 三步流程）

另外，從架構面看，老師把 `embed()` 跟 `searchFruits()` 都放在 `lib/qdrant.js`，初始化跟搜尋（`scripts/embed-fruits.js` + `main.js`）只負責呼叫 — 這跟作業 2 的「工具註冊中心」是同一個原則：**把可複用的核心邏輯抽出來，讓外面的程式只負責流程**。
