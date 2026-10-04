import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document } from "@langchain/core/documents";
import { tool } from "@langchain/core/tools";
import { GetYouTubeTranscript, GetYouTubeTranscriptError, type TranscriptData } from "@tubeagentkit/getyoutubetranscript";
import { z } from "zod";

export const API_KEY_ENV = "GETYOUTUBETRANSCRIPT_API_KEY";

type Client = Pick<GetYouTubeTranscript, "getTranscript" | "search">;

export interface GetYouTubeTranscriptOptions {
  /** API key. Defaults to the GETYOUTUBETRANSCRIPT_API_KEY environment variable. */
  apiKey?: string;
  /** Bring your own client (e.g. for testing). Takes precedence over apiKey. */
  client?: Client;
}

/** The client is created on first use, so building tools never throws. */
function lazyClient(options: GetYouTubeTranscriptOptions): () => Client {
  let client = options.client;
  return () => {
    if (!client) {
      const apiKey = options.apiKey ?? process.env[API_KEY_ENV];
      if (!apiKey) {
        throw new Error(
          `A GetYouTubeTranscript API key is required. Pass { apiKey } or set ${API_KEY_ENV}. ` +
            "Get one at https://getyoutubetranscript.com/dashboard",
        );
      }
      client = new GetYouTubeTranscript({ apiKey });
    }
    return client;
  };
}

/** "1:05", or "1:02:05" past an hour (the clock YouTube shows). */
export function formatPlayerTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function transcriptText(data: TranscriptData, timestamps: boolean): string {
  return timestamps && data.segments?.length
    ? data.segments.map((s) => `[${formatPlayerTime(s.start)}] ${s.text}`).join("\n")
    : data.transcript;
}

/** API errors go back to the agent as text instead of failing the run. */
async function asAgentResult(run: () => Promise<string>): Promise<string> {
  try {
    return await run();
  } catch (error) {
    // Also match by name: instanceof fails if the SDK is loaded twice (ESM and CJS copies).
    if (error instanceof GetYouTubeTranscriptError || (error as Error)?.name === "GetYouTubeTranscriptError") {
      return `Error: ${(error as Error).message}`;
    }
    throw error;
  }
}

/** Tool `youtube_transcript`: a YouTube video's transcript with title and channel. */
export function youtubeTranscriptTool(options: GetYouTubeTranscriptOptions = {}) {
  const getClient = lazyClient(options);
  return tool(
    ({ video, language, timestamps }) =>
      asAgentResult(async () => {
        const data = await getClient().getTranscript({ v: video, language, timestamps: timestamps ?? false });
        return (
          `Title: ${data.title}\nChannel: ${data.author_name}\nLanguage: ${data.language_code}\n\n` +
          transcriptText(data, timestamps ?? false)
        );
      }),
    {
      name: "youtube_transcript",
      description:
        "Get the transcript (spoken text) of a YouTube video from its URL or video ID, with the title and channel. " +
        "Use it to summarize, quote or answer questions about a video.",
      schema: z.object({
        video: z.string().describe("YouTube video URL (watch, youtu.be, Shorts or live) or the 11-character video ID."),
        language: z.string().optional().describe("Optional caption language code, e.g. 'en' or 'es'."),
        timestamps: z.boolean().optional().describe("True to prefix each caption line with its start time, e.g. [1:05]."),
      }),
    },
  );
}

/** Tool `youtube_search`: search YouTube for videos or channels (JSON). */
export function youtubeSearchTool(options: GetYouTubeTranscriptOptions = {}) {
  const getClient = lazyClient(options);
  return tool(
    ({ query, type, pageToken }) =>
      asAgentResult(async () => JSON.stringify(await getClient().search({ q: query, type, pageToken }))),
    {
      name: "youtube_search",
      description:
        "Search YouTube for videos or channels. Returns JSON with titles, video or channel IDs, links, channel, views, " +
        "length and upload date, plus a continuation_token to pass back as pageToken for the next page.",
      schema: z.object({
        query: z.string().describe("What to search YouTube for."),
        type: z.enum(["video", "channel"]).optional().describe("Search for videos (default) or channels."),
        pageToken: z.string().optional().describe("continuation_token from a previous search, for the next page."),
      }),
    },
  );
}

export interface GetYouTubeTranscriptLoaderOptions extends GetYouTubeTranscriptOptions {
  language?: string;
  /** pageContent becomes `[m:ss]` lines and metadata.segments holds the timings. */
  timestamps?: boolean;
}

/** Load YouTube transcripts as Documents, one per video. */
export class GetYouTubeTranscriptLoader extends BaseDocumentLoader {
  private readonly videos: string[];
  private readonly getClient: () => Client;

  constructor(videos: string | string[], private readonly options: GetYouTubeTranscriptLoaderOptions = {}) {
    super();
    this.videos = Array.isArray(videos) ? videos : [videos];
    this.getClient = lazyClient(options);
  }

  async load(): Promise<Document[]> {
    const timestamps = this.options.timestamps ?? false;
    const documents: Document[] = [];
    for (const video of this.videos) {
      const data = await this.getClient().getTranscript({ v: video, language: this.options.language, timestamps });
      documents.push(
        new Document({
          pageContent: transcriptText(data, timestamps),
          metadata: {
            source: `https://www.youtube.com/watch?v=${data.video_id}`,
            videoId: data.video_id,
            title: data.title,
            authorName: data.author_name,
            languageCode: data.language_code,
            wordCount: data.word_count,
            ...(timestamps && data.segments ? { segments: data.segments } : {}),
          },
        }),
      );
    }
    return documents;
  }
}
