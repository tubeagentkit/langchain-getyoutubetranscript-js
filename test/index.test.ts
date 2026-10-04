import { GetYouTubeTranscriptError } from "@tubeagentkit/getyoutubetranscript";
import { describe, expect, it, vi } from "vitest";
import { GetYouTubeTranscriptLoader, youtubeSearchTool, youtubeTranscriptTool } from "../src/index";

const TRANSCRIPT = {
  video_id: "jNQXAC9IVRw",
  language_code: "en",
  title: "Me at the zoo",
  author_name: "jawed",
  author_url: "",
  thumbnail_url: "",
  transcript: "All right, so here we are",
  word_count: 6,
  segments: [{ start: 61, duration: 2, text: "All right, so here we are" }],
};

function fakeClient() {
  return {
    getTranscript: vi.fn().mockResolvedValue(TRANSCRIPT),
    search: vi.fn().mockResolvedValue({ video_results: [{ title: "x" }], continuation_token: "tok" }),
  };
}

describe("youtubeTranscriptTool", () => {
  it("has a stable name and returns header + text", async () => {
    const client = fakeClient();
    const t = youtubeTranscriptTool({ client });
    expect(t.name).toBe("youtube_transcript");
    const out = await t.invoke({ video: "https://youtu.be/jNQXAC9IVRw" });
    expect(client.getTranscript).toHaveBeenCalledWith({ v: "https://youtu.be/jNQXAC9IVRw", language: undefined, timestamps: false });
    expect(out).toBe("Title: Me at the zoo\nChannel: jawed\nLanguage: en\n\nAll right, so here we are");
  });

  it("gives [m:ss] lines with timestamps", async () => {
    const out = await youtubeTranscriptTool({ client: fakeClient() }).invoke({ video: "x", timestamps: true });
    expect(out.endsWith("\n\n[1:01] All right, so here we are")).toBe(true);
  });

  it("returns API errors to the agent as text", async () => {
    const client = fakeClient();
    client.getTranscript.mockRejectedValue(
      new GetYouTubeTranscriptError(400, { success: false, code: "INVALID_URL", message: "Not a recognizable YouTube video URL or id." }),
    );
    expect(await youtubeTranscriptTool({ client }).invoke({ video: "nope" })).toBe(
      "Error: Not a recognizable YouTube video URL or id.",
    );
  });

  it("works as a tool call message (what agents send)", async () => {
    const result = await youtubeTranscriptTool({ client: fakeClient() }).invoke({
      id: "call_1",
      name: "youtube_transcript",
      args: { video: "x", timestamps: true },
      type: "tool_call",
    });
    expect(result.tool_call_id).toBe("call_1");
    expect(String(result.content)).toContain("[1:01]");
  });
});

describe("youtubeSearchTool", () => {
  it("maps args and returns JSON", async () => {
    const client = fakeClient();
    const out = await youtubeSearchTool({ client }).invoke({ query: "q", type: "channel", pageToken: "p" });
    expect(client.search).toHaveBeenCalledWith({ q: "q", type: "channel", pageToken: "p" });
    expect(JSON.parse(out).continuation_token).toBe("tok");
  });
});

describe("GetYouTubeTranscriptLoader", () => {
  it("loads one document per video with metadata", async () => {
    const docs = await new GetYouTubeTranscriptLoader(["a", "b"], { client: fakeClient() }).load();
    expect(docs).toHaveLength(2);
    expect(docs[0].pageContent).toBe("All right, so here we are");
    expect(docs[0].metadata).toEqual({
      source: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      videoId: "jNQXAC9IVRw",
      title: "Me at the zoo",
      authorName: "jawed",
      languageCode: "en",
      wordCount: 6,
    });
  });

  it("timestamps mode adds segments", async () => {
    const [doc] = await new GetYouTubeTranscriptLoader("a", { client: fakeClient(), timestamps: true }).load();
    expect(doc.pageContent).toBe("[1:01] All right, so here we are");
    expect(doc.metadata.segments).toEqual(TRANSCRIPT.segments);
  });

  it("explains a missing key", async () => {
    const saved = process.env.GETYOUTUBETRANSCRIPT_API_KEY;
    delete process.env.GETYOUTUBETRANSCRIPT_API_KEY;
    await expect(new GetYouTubeTranscriptLoader("a").load()).rejects.toThrow("GETYOUTUBETRANSCRIPT_API_KEY");
    if (saved) process.env.GETYOUTUBETRANSCRIPT_API_KEY = saved;
  });
});
