// 初始化:把 5 筆水果轉成 embedding 並存進 Qdrant
// 執行: npm run init (= node scripts/embed-fruits.js)

import { client } from "../lib/openai.js";
import {
  qdrant,
  FRUITS_COLLECTION,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
} from "../lib/qdrant.js";
import { FRUITS, fruitToText } from "../data/fruits.js";

async function recreateCollection() {
  const exists = await qdrant.collectionExists(FRUITS_COLLECTION);
  if (exists.exists) {
    await qdrant.deleteCollection(FRUITS_COLLECTION);
    console.log(`已刪除舊 collection: ${FRUITS_COLLECTION}`);
  }
  await qdrant.createCollection(FRUITS_COLLECTION, {
    vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
  });
  console.log(`已建立 collection: ${FRUITS_COLLECTION} (dim=${EMBEDDING_DIM}, distance=Cosine)`);
}

async function embedBatch(texts) {
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

async function main() {
  console.log(`📦 準備將 ${FRUITS.length} 筆水果資料存入 Qdrant`);

  await recreateCollection();

  const texts = FRUITS.map(fruitToText);
  console.log("\n🔍 預覽要 embed 的文字（第 1 筆）:");
  console.log(texts[0]);
  console.log("...");

  console.log(`\n🧠 呼叫 OpenAI Embeddings API (model=${EMBEDDING_MODEL})...`);
  const vectors = await embedBatch(texts);
  console.log(`✅ 取得 ${vectors.length} 個向量,每個維度 ${vectors[0].length}`);

  const points = FRUITS.map((fruit, idx) => ({
    id: fruit.id,
    vector: vectors[idx],
    payload: {
      name: fruit.name,
      region: fruit.region,
      season: fruit.season,
      varieties: fruit.varieties,
      description: fruit.description,
    },
  }));

  await qdrant.upsert(FRUITS_COLLECTION, { wait: true, points });
  console.log(`\n✅ 已 upsert ${points.length} 筆向量到 ${FRUITS_COLLECTION}`);

  const info = await qdrant.getCollection(FRUITS_COLLECTION);
  console.log(`📊 collection 目前共有 ${info.points_count} 筆資料`);
  console.log("\n🎉 初始化完成！可以執行 npm start 開始搜尋");
}

main().catch((err) => {
  console.error("❌ 初始化失敗:", err);
  process.exit(1);
});
