export type WebSearchDecision = {
  needWebSearch: boolean;
  query: string;
};

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
  favicon?: string;
  publishedAt?: string;
};

export type WebSearchResponse = {
  ok: boolean;
  provider:
    | "tavily"
    | "bing-html"
    | "bing-rss"
    | "open-meteo"
    | "official-cwl"
    | "zhcw";
  query: string;
  results: WebSearchResult[];
  error?: string;
};

export type WebSearchTrace = {
  query: string;
  searchedAt: string;
  mode: "tool" | "decision";
  results: WebSearchResult[];
  error?: string;
};
