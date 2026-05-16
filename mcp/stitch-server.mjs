#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createStitchClient,
  fetchBase64,
  fetchText,
  getScreen,
  listScreens,
  STITCH_PROJECT_ID,
} from "../scripts/stitch-common.mjs";

const server = new McpServer({
  name: "tb-fo-stitch",
  version: "1.0.0",
});

const withClient = async (fn) => {
  const client = createStitchClient();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
};

const textResult = (value) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

server.tool(
  "stitch_list_screens",
  "List screens from the approved TB-FO Assistant Stitch project.",
  {
    projectId: z.string().optional(),
  },
  async ({ projectId }) =>
    textResult(await withClient((client) => listScreens(client, projectId || STITCH_PROJECT_ID))),
);

server.tool(
  "stitch_get_screen_metadata",
  "Get metadata for one Stitch screen.",
  {
    projectId: z.string().optional(),
    screenId: z.string(),
  },
  async ({ projectId, screenId }) =>
    textResult(await withClient((client) => getScreen(client, projectId || STITCH_PROJECT_ID, screenId))),
);

server.tool(
  "stitch_get_screen_code",
  "Download one Stitch screen's generated HTML code.",
  {
    projectId: z.string().optional(),
    screenId: z.string(),
  },
  async ({ projectId, screenId }) =>
    withClient(async (client) => {
      const screen = await getScreen(client, projectId || STITCH_PROJECT_ID, screenId);
      const htmlUrl = screen.htmlCode?.downloadUrl;
      if (!htmlUrl) throw new Error("Screen does not have an HTML download URL.");
      return textResult(await fetchText(htmlUrl));
    }),
);

server.tool(
  "stitch_get_screen_image",
  "Download one Stitch screen screenshot as base64.",
  {
    projectId: z.string().optional(),
    screenId: z.string(),
  },
  async ({ projectId, screenId }) =>
    withClient(async (client) => {
      const screen = await getScreen(client, projectId || STITCH_PROJECT_ID, screenId);
      const imageUrl = screen.screenshot?.downloadUrl;
      if (!imageUrl) throw new Error("Screen does not have an image download URL.");
      return textResult(await fetchBase64(imageUrl));
    }),
);

server.tool(
  "stitch_build_manifest",
  "Return a Stitch manifest with all approved screens and download URLs.",
  {
    projectId: z.string().optional(),
  },
  async ({ projectId }) =>
    textResult({
      projectId: projectId || STITCH_PROJECT_ID,
      screens: await withClient((client) => listScreens(client, projectId || STITCH_PROJECT_ID)),
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
