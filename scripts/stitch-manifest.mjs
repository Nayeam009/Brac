import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createStitchClient, listScreens, STITCH_PROJECT_ID } from "./stitch-common.mjs";

const outDir = resolve("stitch");
const outFile = resolve(outDir, "manifest.json");
const client = createStitchClient();

try {
  const screens = await listScreens(client, STITCH_PROJECT_ID);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    outFile,
    JSON.stringify(
      {
        projectId: STITCH_PROJECT_ID,
        generatedAt: new Date().toISOString(),
        screenCount: screens.length,
        screens,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${screens.length} Stitch screens to ${outFile}`);
} finally {
  await client.close();
}
