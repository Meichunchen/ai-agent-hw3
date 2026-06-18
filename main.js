// 互動式搜尋:你輸入問題,從 Qdrant 找出最相關的水果
// 執行: npm start (= node main.js)

import { input } from "@inquirer/prompts";
import { searchFruits } from "./lib/qdrant.js";
import { spinner } from "./utils/spinner.js";

console.log("🍎 水果知識庫搜尋");
console.log("試試問:");
console.log("  • 夏天有什麼水果可以吃?");
console.log("  • 維他命 C 含量最高的水果是哪個?");
console.log("  • 屏東出產的水果有哪些?");
console.log("（輸入 exit 結束）\n");

try {
  while (true) {
    const query = (
      await input({ message: "請輸入要搜尋的水果問題：" })
    ).trim();

    if (query === "") continue;
    if (query.toLowerCase() === "exit") {
      console.log("再會~");
      break;
    }

    const spin = spinner("搜尋中...").start();
    const results = await searchFruits(query, 5);
    spin.stop();

    console.log(`\n找到 ${results.length} 筆結果（依相似度由高到低）:`);
    for (const [i, r] of results.entries()) {
      console.log(`\n  ${i + 1}. ${r.name}`);
      console.log(`     相似度分數：${r.score.toFixed(4)}`);
      console.log(`     產地：${r.region}`);
      console.log(`     季節：${r.season}`);
      console.log(`     品種：${r.varieties.join("、")}`);
      console.log(`     特色：${r.description.slice(0, 60)}...`);
    }
    console.log();
  }
} catch (err) {
  if (err.name === "ExitPromptError") {
    console.log("\n再會~");
  } else {
    throw err;
  }
}
