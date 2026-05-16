import { StitchToolClient } from "@google/stitch-sdk";

export const STITCH_PROJECT_ID = process.env.STITCH_PROJECT_ID || "15270537560553858375";

export function createStitchClient() {
  const apiKey = process.env.STITCH_API_KEY;

  if (!apiKey) {
    throw new Error("Missing STITCH_API_KEY. Put it in your local .env or shell environment.");
  }

  return new StitchToolClient({ apiKey });
}

export async function listScreens(client, projectId = STITCH_PROJECT_ID) {
  const response = await client.callTool("list_screens", { projectId });
  const screens = Array.isArray(response?.screens) ? response.screens : [];

  return Promise.all(
    screens.map(async (screen) => {
      const screenId = (screen.name || "").split("/").pop() || screen.screenId || screen.id;
      const metadata = await getScreen(client, projectId, screenId);

      return {
        title: metadata.title,
        screenId,
        projectId,
        deviceType: metadata.deviceType,
        width: Number(metadata.width || 0),
        height: Number(metadata.height || 0),
        htmlUrl: metadata.htmlCode?.downloadUrl,
        imageUrl: metadata.screenshot?.downloadUrl,
      };
    }),
  );
}

export async function getScreen(client, projectId, screenId) {
  return client.callTool("get_screen", {
    name: `projects/${projectId}/screens/${screenId}`,
    projectId,
    screenId,
  });
}

export async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download Stitch asset: ${response.status}`);
  return response.text();
}

export async function fetchBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download Stitch image: ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    contentType,
    base64: buffer.toString("base64"),
  };
}
