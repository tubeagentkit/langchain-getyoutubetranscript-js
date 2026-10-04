# @tubeagentkit/langchain-getyoutubetranscript

YouTube transcript tools and a document loader for [LangChain.js](https://js.langchain.com), powered by the [GetYouTubeTranscript](https://getyoutubetranscript.com) API. Give agents the transcript of any YouTube video (optionally with `[m:ss]` timestamps) and YouTube search, or load transcripts into RAG pipelines.

The API fetches transcripts on its own servers, so it works on serverless platforms and cloud servers without proxies, and without `RequestBlocked` / `IpBlocked` errors.

Python version: [`langchain-getyoutubetranscript`](https://pypi.org/project/langchain-getyoutubetranscript/).

## Install

```bash
npm install @tubeagentkit/langchain-getyoutubetranscript @langchain/core zod
```

Get an API key at [getyoutubetranscript.com/dashboard](https://getyoutubetranscript.com/dashboard) (free tier included):

```bash
GETYOUTUBETRANSCRIPT_API_KEY=sk_live_...
```

Or pass `{ apiKey }` to any tool or the loader.

## Tools

| Factory | Tool name | What it does |
| --- | --- | --- |
| `youtubeTranscriptTool()` | `youtube_transcript` | Transcript of a video (URL or ID) with title and channel. `timestamps: true` gives `[m:ss]` lines. |
| `youtubeSearchTool()` | `youtube_search` | Search YouTube for videos or channels. JSON with a `continuation_token` for the next page. |

```ts
import { youtubeTranscriptTool } from '@tubeagentkit/langchain-getyoutubetranscript';

const tool = youtubeTranscriptTool();
console.log(await tool.invoke({ video: 'https://youtu.be/jNQXAC9IVRw', timestamps: true }));
// Title: Me at the zoo
// Channel: jawed
// Language: en
//
// [0:01] All right, so here we are, in front of the elephants
```

API errors (no captions, invalid video, out of credits) come back to the agent as `Error: ...` text instead of failing the run.

### With an agent

```ts
import { createAgent } from 'langchain';
import { youtubeSearchTool, youtubeTranscriptTool } from '@tubeagentkit/langchain-getyoutubetranscript';

const agent = createAgent({
  model: 'openai:gpt-5-mini',
  tools: [youtubeSearchTool(), youtubeTranscriptTool()],
});

await agent.invoke({
  messages: [{ role: 'user', content: 'Find a short talk on transformers and summarize it with timestamps.' }],
});
```

## Document loader

```ts
import { GetYouTubeTranscriptLoader } from '@tubeagentkit/langchain-getyoutubetranscript';

const docs = await new GetYouTubeTranscriptLoader(['https://youtu.be/jNQXAC9IVRw', '5e37ZT3SQbk']).load();
console.log(docs[0].metadata);
// { source: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', videoId: 'jNQXAC9IVRw', title: 'Me at the zoo',
//   authorName: 'jawed', languageCode: 'en', wordCount: 39 }
```

Options: `language`, `timestamps` (`pageContent` becomes `[m:ss]` lines and `metadata.segments` holds `{ start, duration, text }` per caption line), `apiKey`.

## Pricing

Each transcript or search request uses one credit from your GetYouTubeTranscript account. Failed requests are not charged.

## Links

- [GetYouTubeTranscript API docs](https://getyoutubetranscript.com/docs)
- [Node.js SDK](https://www.npmjs.com/package/@tubeagentkit/getyoutubetranscript) (this package is built on it)
- License: MIT
