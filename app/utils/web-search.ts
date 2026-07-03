import { getServerSideConfig } from "@/app/config/server";
import type {
  WebSearchResponse,
  WebSearchResult,
} from "@/app/typing/web-search";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const BING_HTML_SEARCH_URL = "https://www.bing.com/search?q=";
const BING_RSS_SEARCH_URL = "https://www.bing.com/search?format=rss&q=";
const OPEN_METEO_GEOCODING_URL =
  "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CWL_DRAW_NOTICE_URL =
  "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice";
const CWL_BASE_URL = "https://www.cwl.gov.cn";
const ZHCW_DRAW_DETAIL_URL = "https://jc.zhcw.com/port/client_json.php";
const ZHCW_BASE_URL = "https://www.zhcw.com";
const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
const SEARCH_PROVIDER_MAX_RESULTS = 10;

const SEARCH_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
} as const;

type TavilySearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    favicon?: string;
    published_date?: string;
  }>;
  error?: string;
};

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
    timezone?: string;
    population?: number;
  }>;
};

type OpenMeteoForecastResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

type CwlLotteryGame = {
  apiName: "ssq" | "3d" | "qlc" | "kl8";
  label: string;
  pagePath: string;
  zhcwLotteryId: string;
  zhcwPath: string;
};

type SearchIntent = {
  isDefinitionQuery: boolean;
  isLotteryDrawQuery: boolean;
  cwlLotteryGame?: CwlLotteryGame;
  issueCode?: string;
};

type CwlDrawNoticeItem = {
  name?: string;
  code?: string;
  detailsLink?: string;
  date?: string;
  red?: string;
  blue?: string;
  blue2?: string;
  sales?: string;
  poolmoney?: string;
  content?: string;
  specialRuleInfo?: string;
  prizegrades?: Array<{
    type?: number;
    typenum?: string;
    typemoney?: string;
  }>;
};

type CwlDrawNoticeResponse = {
  state?: number;
  message?: string;
  total?: number;
  result?: CwlDrawNoticeItem[];
};

type ZhcwWinnerDetail = {
  awardEtc?: string;
  baseBetWinner?:
    | {
        remark?: string;
        awardNum?: string;
        awardMoney?: string;
      }
    | "";
};

type ZhcwDrawDetailResponse = {
  resCode?: string;
  issue?: string;
  openTime?: string;
  saleMoney?: string;
  frontWinningNum?: string;
  backWinningNum?: string;
  firstPrizeAddress?: string;
  prizePoolMoney?: string;
  deadlineAwardDate?: string;
  awardEndDesc?: string;
  winnerDetails?: ZhcwWinnerDetail[];
};

const CWL_LOTTERY_GAMES: CwlLotteryGame[] = [
  {
    apiName: "ssq",
    label: "双色球",
    pagePath: "/ygkj/wqkjgg/ssq/",
    zhcwLotteryId: "1",
    zhcwPath: "/kjxx/ssq/",
  },
  {
    apiName: "3d",
    label: "福彩3D",
    pagePath: "/ygkj/wqkjgg/3d/",
    zhcwLotteryId: "2",
    zhcwPath: "/kjxx/3d/",
  },
  {
    apiName: "qlc",
    label: "七乐彩",
    pagePath: "/ygkj/wqkjgg/qlc/",
    zhcwLotteryId: "3",
    zhcwPath: "/kjxx/qlc/",
  },
  {
    apiName: "kl8",
    label: "快乐8",
    pagePath: "/ygkj/wqkjgg/kl8/",
    zhcwLotteryId: "6",
    zhcwPath: "/kjxx/kl8/",
  },
];

const IMPORTANT_QUERY_TERMS = [
  "中国福利彩票",
  "中国福彩",
  "中福彩",
  "中国体彩网",
  "体育彩票",
  "双色球",
  "大乐透",
  "七乐彩",
  "快乐8",
  "福彩3D",
  "排列三",
  "排列五",
  "七星彩",
  "开奖公告",
  "开奖结果",
  "开奖号码",
  "开奖",
  "中奖",
  "奖池",
  "官方",
  "官网",
  "OpenAI",
  "ChatGPT",
  "Claude",
  "Gemini",
  "DeepSeek",
  "Grok",
  "GLM",
  "Qwen",
  "Kimi",
];

const AUTHORITY_DOMAIN_WEIGHTS: Array<{
  pattern: RegExp;
  weight: number;
}> = [
  { pattern: /(^|\.)cwl\.gov\.cn$/i, weight: 120 },
  { pattern: /(^|\.)lottery\.gov\.cn$/i, weight: 110 },
  { pattern: /(^|\.)sporttery\.cn$/i, weight: 100 },
  { pattern: /(^|\.)zhcw\.com$/i, weight: 70 },
  { pattern: /(^|\.)mca\.gov\.cn$/i, weight: 60 },
  { pattern: /(^|\.)gov\.cn$/i, weight: 45 },
  { pattern: /(^|\.)openai\.com$/i, weight: 55 },
  { pattern: /(^|\.)anthropic\.com$/i, weight: 55 },
  { pattern: /(^|\.)deepseek\.com$/i, weight: 55 },
  { pattern: /(^|\.)ai\.google\.dev$/i, weight: 55 },
  { pattern: /(^|\.)deepmind\.google$/i, weight: 55 },
  { pattern: /(^|\.)x\.ai$/i, weight: 55 },
  { pattern: /(^|\.)qwenlm\.github\.io$/i, weight: 55 },
  { pattern: /(^|\.)alibabacloud\.com$/i, weight: 50 },
  { pattern: /(^|\.)zhipuai\.cn$/i, weight: 55 },
  { pattern: /(^|\.)google\.com$/i, weight: 45 },
];

const LOW_QUALITY_HOST_PATTERNS = [
  /(^|\.)baike\.baidu\.com$/i,
  /(^|\.)baijiahao\.baidu\.com$/i,
  /(^|\.)zhidao\.baidu\.com$/i,
  /(^|\.)hanyu\.baidu\.com$/i,
  /(^|\.)zdic\.net$/i,
  /(^|\.)hanyuguoxue\.com$/i,
  /(^|\.)cidianwang\.com$/i,
  /(^|\.)dict\.youdao\.com$/i,
  /(^|\.)dictionary\.cambridge\.org$/i,
];

const OFFICIAL_QUERY_DOMAIN_HINTS: Array<{
  pattern: RegExp;
  domains: string[];
}> = [
  {
    pattern: /\b(openai|chatgpt|gpt)\b/i,
    domains: ["openai.com", "chatgpt.com"],
  },
  {
    pattern: /\b(claude|anthropic|opus|sonnet|haiku)\b/i,
    domains: ["anthropic.com"],
  },
  { pattern: /\b(deepseek)\b/i, domains: ["deepseek.com"] },
  {
    pattern: /\b(gemini|google ai)\b/i,
    domains: ["ai.google.dev", "deepmind.google"],
  },
  { pattern: /\b(grok|xai)\b/i, domains: ["x.ai"] },
  {
    pattern: /\b(qwen|通义千问)\b/i,
    domains: ["qwenlm.github.io", "alibabacloud.com"],
  },
  { pattern: /\b(glm|智谱|zhipu)\b/i, domains: ["zhipuai.cn"] },
];

const DIRECT_OFFICIAL_SOURCE_HINTS: Array<{
  pattern: RegExp;
  sources: Array<Pick<WebSearchResult, "title" | "url" | "content">>;
}> = [
  {
    pattern: /\b(openai|chatgpt|gpt)\b/i,
    sources: [
      {
        title: "OpenAI API pricing",
        url: "https://developers.openai.com/api/docs/pricing",
        content:
          "Official OpenAI API pricing page for model token pricing, tools, and API costs.",
      },
      {
        title: "OpenAI models",
        url: "https://developers.openai.com/api/docs/models",
        content:
          "Official OpenAI model list with model IDs, capabilities, context windows, and pricing summaries.",
      },
      {
        title: "OpenAI API platform",
        url: "https://openai.com/api/",
        content:
          "Official OpenAI API platform overview with current flagship model and product information.",
      },
    ],
  },
  {
    pattern: /\b(claude|anthropic|opus|sonnet|haiku)\b/i,
    sources: [
      {
        title: "Anthropic Claude models",
        url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
        content:
          "Official Anthropic documentation for Claude model families, capabilities, and model IDs.",
      },
      {
        title: "Anthropic Claude pricing",
        url: "https://docs.anthropic.com/en/docs/about-claude/pricing",
        content: "Official Anthropic documentation for Claude API pricing.",
      },
    ],
  },
  {
    pattern: /\b(deepseek)\b/i,
    sources: [
      {
        title: "DeepSeek API pricing",
        url: "https://api-docs.deepseek.com/quick_start/pricing",
        content:
          "Official DeepSeek API documentation for model pricing and billing.",
      },
      {
        title: "DeepSeek API models",
        url: "https://api-docs.deepseek.com/quick_start/parameter_settings",
        content:
          "Official DeepSeek API documentation for supported model parameters.",
      },
    ],
  },
  {
    pattern: /\b(gemini|google ai)\b/i,
    sources: [
      {
        title: "Gemini API pricing",
        url: "https://ai.google.dev/gemini-api/docs/pricing",
        content: "Official Google AI documentation for Gemini API pricing.",
      },
      {
        title: "Gemini models",
        url: "https://ai.google.dev/gemini-api/docs/models",
        content:
          "Official Google AI documentation for Gemini models and capabilities.",
      },
    ],
  },
  {
    pattern: /\b(grok|xai)\b/i,
    sources: [
      {
        title: "xAI models",
        url: "https://docs.x.ai/docs/models",
        content: "Official xAI documentation for Grok models and capabilities.",
      },
      {
        title: "xAI pricing and rate limits",
        url: "https://docs.x.ai/docs/models",
        content:
          "Official xAI documentation entry point for Grok model details, pricing, and rate limits.",
      },
    ],
  },
  {
    pattern: /\b(qwen|通义千问)\b/i,
    sources: [
      {
        title: "Qwen model documentation",
        url: "https://qwenlm.github.io/",
        content:
          "Official Qwen documentation for Qwen model releases and capabilities.",
      },
      {
        title: "Alibaba Cloud Model Studio",
        url: "https://www.alibabacloud.com/help/en/model-studio/",
        content:
          "Official Alibaba Cloud documentation for Model Studio and Qwen API usage.",
      },
    ],
  },
  {
    pattern: /\b(glm|智谱|zhipu)\b/i,
    sources: [
      {
        title: "Zhipu AI Open Platform",
        url: "https://open.bigmodel.cn/",
        content:
          "Official Zhipu AI open platform for GLM models, API documentation, and pricing.",
      },
    ],
  },
];

function decodeXmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(text: string) {
  return text.replace(/<[^>]+>/g, " ");
}

function normalizeText(text?: string) {
  return decodeXmlEntities(stripHtmlTags(text ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function getResultHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function resolveUrl(url: string, baseUrl?: string) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function decodeMaybeBase64Url(value: string) {
  try {
    const paddedValue = value + "=".repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(
      paddedValue.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
  } catch {
    return "";
  }
}

function normalizeSearchResultUrl(rawUrl: string) {
  const url = decodeXmlEntities(rawUrl.trim());

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const encodedTarget = parsedUrl.searchParams.get("u");

    if (host.endsWith("bing.com") && encodedTarget) {
      const decodedTarget = decodeMaybeBase64Url(
        encodedTarget.replace(/^a1/, ""),
      );
      if (/^https?:\/\//i.test(decodedTarget)) {
        return decodedTarget;
      }
    }
  } catch {
    // Keep the original URL if it is not parseable.
  }

  return url;
}

function dedupeResults(results: WebSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.url.toLowerCase().replace(/[?#].*$/, "");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function detectCwlLotteryGame(query: string) {
  if (/双色球|ssq/i.test(query)) {
    return CWL_LOTTERY_GAMES.find((game) => game.apiName === "ssq");
  }

  if (/福彩\s*3d|福彩3d|3d\s*开奖/i.test(query)) {
    return CWL_LOTTERY_GAMES.find((game) => game.apiName === "3d");
  }

  if (/七乐彩|qlc/i.test(query)) {
    return CWL_LOTTERY_GAMES.find((game) => game.apiName === "qlc");
  }

  if (/快乐\s*8|快乐8|kl8/i.test(query)) {
    return CWL_LOTTERY_GAMES.find((game) => game.apiName === "kl8");
  }

  return undefined;
}

function detectSearchIntent(query: string): SearchIntent {
  const cwlLotteryGame = detectCwlLotteryGame(query);
  const issueCode = query.match(/\b20\d{5}\b/)?.[0];
  const hasLotteryKeyword =
    /彩票|福彩|体彩|双色球|大乐透|七乐彩|快乐\s*8|福彩\s*3d|开奖|中奖|奖池/i.test(
      query,
    );

  return {
    isDefinitionQuery:
      /是什么|什么意思|含义|定义|百科|词典|读音|拼音|meaning|definition/i.test(
        query,
      ),
    isLotteryDrawQuery: !!cwlLotteryGame && hasLotteryKeyword,
    cwlLotteryGame,
    issueCode,
  };
}

function extractQueryTokens(query: string) {
  const tokens = new Set<string>();
  const lowerQuery = query.toLowerCase();

  for (const term of IMPORTANT_QUERY_TERMS) {
    if (lowerQuery.includes(term.toLowerCase())) {
      tokens.add(term.toLowerCase());
    }
  }

  for (const token of query.match(/[a-z0-9][a-z0-9._-]{1,}/gi) ?? []) {
    tokens.add(token.toLowerCase());
  }

  for (const token of query.match(/20\d{5}|\d{4,}/g) ?? []) {
    tokens.add(token);
  }

  for (const token of query.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    if (token.length <= 6) {
      tokens.add(token);
    } else {
      for (const term of IMPORTANT_QUERY_TERMS) {
        if (token.includes(term)) {
          tokens.add(term.toLowerCase());
        }
      }
    }
  }

  return Array.from(tokens);
}

function getAuthorityWeight(host: string) {
  for (const item of AUTHORITY_DOMAIN_WEIGHTS) {
    if (item.pattern.test(host)) {
      return item.weight;
    }
  }

  return 0;
}

function isLowQualityHost(host: string) {
  return LOW_QUALITY_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function scoreSearchResult(
  result: WebSearchResult,
  query: string,
  intent: SearchIntent,
) {
  const host = getResultHost(result.url);
  const haystack =
    `${result.title} ${result.content} ${result.url}`.toLowerCase();
  const tokens = extractQueryTokens(query);
  const matchedTokenCount = tokens.reduce(
    (count, token) => count + (haystack.includes(token.toLowerCase()) ? 1 : 0),
    0,
  );
  const mustHaveTokens = intent.isLotteryDrawQuery
    ? [
        intent.cwlLotteryGame?.label.toLowerCase(),
        intent.issueCode,
        "开奖",
      ].filter(Boolean)
    : [];
  const missingMustHaveCount = mustHaveTokens.filter(
    (token) => !haystack.includes(String(token).toLowerCase()),
  ).length;
  let score = 0;

  score += matchedTokenCount * 16;
  score += getAuthorityWeight(host);

  if (intent.isLotteryDrawQuery) {
    if (/开奖|开奖结果|开奖公告|开奖号码/.test(haystack)) {
      score += 28;
    }

    if (/彩票|福彩|中福彩|中国福利彩票/.test(haystack)) {
      score += 18;
    }

    if (intent.issueCode && haystack.includes(intent.issueCode)) {
      score += 32;
    }

    if (/baike|百科|词典|汉语|dictionary|dict/i.test(haystack)) {
      score -= 90;
    }
  }

  if (missingMustHaveCount > 0) {
    score -= missingMustHaveCount * 45;
  }

  if (isLowQualityHost(host) && !intent.isDefinitionQuery) {
    score -= 80;
  }

  if (/广告|推广|app下载|下载/.test(result.title)) {
    score -= 25;
  }

  return score;
}

function rankAndFilterResults(
  results: WebSearchResult[],
  query: string,
  intent: SearchIntent,
  maxResults: number,
) {
  const scoredResults = dedupeResults(results)
    .map((result, index) => ({
      ...result,
      score: Math.round(scoreSearchResult(result, query, intent) * 100) / 100,
      originalIndex: index,
    }))
    .filter((result) => {
      if (
        intent.isLotteryDrawQuery &&
        getAuthorityWeight(getResultHost(result.url)) < 60
      ) {
        return false;
      }

      if (intent.isLotteryDrawQuery) {
        return (result.score ?? 0) >= 20;
      }

      return (result.score ?? 0) >= -20;
    })
    .sort((left, right) => {
      const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.originalIndex - right.originalIndex;
    });

  return scoredResults
    .slice(0, maxResults)
    .map(({ originalIndex, ...result }) => result);
}

function formatAmount(value?: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return "";
  }

  const numericValue = Number(normalized);
  if (Number.isNaN(numericValue)) {
    return normalized;
  }

  return numericValue.toLocaleString("zh-CN");
}

function splitLotteryBalls(value?: string) {
  return (value ?? "")
    .split(",")
    .map((ball) => ball.trim())
    .filter(Boolean);
}

function formatLotteryBalls(item: CwlDrawNoticeItem, game: CwlLotteryGame) {
  const redBalls = splitLotteryBalls(item.red);
  const blueBalls = splitLotteryBalls(item.blue);
  const secondBlueBalls = splitLotteryBalls(item.blue2);

  if (game.apiName === "ssq") {
    return [
      redBalls.length ? `红球 ${redBalls.join("、")}` : "",
      blueBalls.length ? `蓝球 ${blueBalls.join("、")}` : "",
    ]
      .filter(Boolean)
      .join("；");
  }

  if (game.apiName === "qlc") {
    return [
      redBalls.length ? `基本号码 ${redBalls.join("、")}` : "",
      blueBalls.length ? `特别号码 ${blueBalls.join("、")}` : "",
    ]
      .filter(Boolean)
      .join("；");
  }

  if (game.apiName === "kl8") {
    return redBalls.length ? `开奖号码 ${redBalls.join("、")}` : "";
  }

  return [
    redBalls.length ? `开奖号码 ${redBalls.join("、")}` : "",
    blueBalls.length ? `试机号 ${blueBalls.join("、")}` : "",
    secondBlueBalls.length ? `其他号码 ${secondBlueBalls.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("；");
}

function formatPrizeGrades(item: CwlDrawNoticeItem) {
  return (item.prizegrades ?? [])
    .filter((grade) => grade.typenum || grade.typemoney)
    .slice(0, 6)
    .map((grade) => {
      const type = grade.type ? `${grade.type}等奖` : "奖级";
      const count = grade.typenum
        ? `${formatAmount(grade.typenum)}注`
        : "注数未公布";
      const money = grade.typemoney
        ? `每注 ${formatAmount(grade.typemoney)} 元`
        : "奖金未公布";
      return `${type}${count}，${money}`;
    })
    .join("；");
}

function normalizeCwlDetailUrl(item: CwlDrawNoticeItem, game: CwlLotteryGame) {
  if (item.detailsLink) {
    return resolveUrl(item.detailsLink, CWL_BASE_URL);
  }

  return resolveUrl(game.pagePath, CWL_BASE_URL);
}

function buildCwlResult(
  item: CwlDrawNoticeItem,
  game: CwlLotteryGame,
): WebSearchResult | null {
  const code = item.code?.trim();
  const titleName = item.name?.trim() || game.label;
  const balls = formatLotteryBalls(item, game);

  if (!code || !balls) {
    return null;
  }

  const sales = formatAmount(item.sales);
  const poolMoney = formatAmount(item.poolmoney);
  const prizeSummary = formatPrizeGrades(item);
  const contentParts = [
    "来源：中国福利彩票发行管理中心官方网站。",
    item.date ? `开奖日期：${item.date}。` : "",
    `开奖号码：${balls}。`,
    sales ? `销售额：${sales} 元。` : "",
    poolMoney ? `奖池金额：${poolMoney} 元。` : "",
    prizeSummary ? `奖级摘要：${prizeSummary}。` : "",
    item.content ? `中奖分布：${item.content}` : "",
    item.specialRuleInfo ? `特别说明：${item.specialRuleInfo}` : "",
  ].filter(Boolean);

  return {
    title: `${titleName}第 ${code} 期官方开奖结果`,
    url: normalizeCwlDetailUrl(item, game),
    content: contentParts.join(" "),
    score: 999,
    publishedAt: item.date?.match(/\d{4}-\d{2}-\d{2}/)?.[0],
  };
}

function extractJsonpPayload(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^[\w$.]+\(([\s\S]*)\);?$/);
  return match?.[1] ?? trimmed;
}

function normalizeSpaceSeparatedBalls(value?: string) {
  return (value ?? "")
    .split(/\s+/)
    .map((ball) => ball.trim())
    .filter(Boolean);
}

function formatZhcwPrizeGrades(item: ZhcwDrawDetailResponse) {
  return (item.winnerDetails ?? [])
    .map((detail) => {
      const winner = detail.baseBetWinner;
      if (!winner || typeof winner === "string") {
        return "";
      }

      const remark = winner.remark || `${detail.awardEtc ?? ""}等奖`;
      const count = winner.awardNum
        ? `${formatAmount(winner.awardNum)}注`
        : "注数未公布";
      const money = winner.awardMoney
        ? `每注 ${formatAmount(winner.awardMoney)} 元`
        : "奖金未公布";
      return `${remark}${count}，${money}`;
    })
    .filter(Boolean)
    .slice(0, 7)
    .join("；");
}

function buildZhcwResult(
  item: ZhcwDrawDetailResponse,
  game: CwlLotteryGame,
): WebSearchResult | null {
  const issue = item.issue?.trim();
  const frontBalls = normalizeSpaceSeparatedBalls(item.frontWinningNum);
  const backBalls = normalizeSpaceSeparatedBalls(item.backWinningNum);

  if (!issue || frontBalls.length === 0) {
    return null;
  }

  const balls =
    game.apiName === "ssq"
      ? [
          `红球 ${frontBalls.join("、")}`,
          backBalls.length ? `蓝球 ${backBalls.join("、")}` : "",
        ]
          .filter(Boolean)
          .join("；")
      : [
          `开奖号码 ${frontBalls.join("、")}`,
          backBalls.length ? `后区/特别号码 ${backBalls.join("、")}` : "",
        ]
          .filter(Boolean)
          .join("；");
  const prizeSummary = formatZhcwPrizeGrades(item);
  const contentParts = [
    "来源：中彩网开奖数据接口，页面底部链接指向中国福彩网、中国体彩网等官方彩票信息站点。",
    item.openTime ? `开奖日期：${item.openTime}。` : "",
    `开奖号码：${balls}。`,
    item.saleMoney ? `销售额：${formatAmount(item.saleMoney)} 元。` : "",
    item.prizePoolMoney
      ? `奖池金额：${formatAmount(item.prizePoolMoney)} 元。`
      : "",
    prizeSummary ? `奖级摘要：${prizeSummary}。` : "",
    item.firstPrizeAddress ? `一等奖分布：${item.firstPrizeAddress}` : "",
    item.deadlineAwardDate ? `兑奖截止：${item.deadlineAwardDate}。` : "",
  ].filter(Boolean);

  return {
    title: `${game.label}第 ${issue} 期开奖结果（中彩网数据）`,
    url: resolveUrl(`${game.zhcwPath}kjxq/?kjData=${issue}`, ZHCW_BASE_URL),
    content: contentParts.join(" "),
    score: 940,
    publishedAt: item.openTime,
  };
}

async function searchZhcwLottery(
  query: string,
  intent: SearchIntent,
): Promise<WebSearchResponse | null> {
  const game = intent.cwlLotteryGame;
  if (!intent.isLotteryDrawQuery || !game || !intent.issueCode) {
    return null;
  }

  const params = new URLSearchParams({
    transactionType: "10001002",
    lotteryId: game.zhcwLotteryId,
    issue: intent.issueCode,
    tt: "0.1",
    callback: "jQuery",
  });

  try {
    const response = await fetch(`${ZHCW_DRAW_DETAIL_URL}?${params}`, {
      headers: {
        ...SEARCH_REQUEST_HEADERS,
        Accept: "application/javascript,application/json,*/*;q=0.8",
        Referer: resolveUrl(game.zhcwPath, ZHCW_BASE_URL),
      },
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        provider: "zhcw",
        query,
        results: [],
        error: text || `${response.status} ${response.statusText}`,
      };
    }

    const json = JSON.parse(
      extractJsonpPayload(text),
    ) as ZhcwDrawDetailResponse;
    const result = buildZhcwResult(json, game);

    if (!result) {
      return {
        ok: false,
        provider: "zhcw",
        query,
        results: [],
        error: "No ZHCW lottery result returned",
      };
    }

    return {
      ok: true,
      provider: "zhcw",
      query,
      results: [result],
    };
  } catch (error) {
    return {
      ok: false,
      provider: "zhcw",
      query,
      results: [],
      error:
        error instanceof Error ? error.message : "ZHCW lottery search failed",
    };
  }
}

async function searchOfficialCwlLottery(
  query: string,
  intent: SearchIntent,
): Promise<WebSearchResponse | null> {
  const game = intent.cwlLotteryGame;
  if (!intent.isLotteryDrawQuery || !game) {
    return null;
  }

  const params = new URLSearchParams({
    name: game.apiName,
    issueCount: intent.issueCode ? "" : "1",
    issueStart: intent.issueCode ?? "",
    issueEnd: intent.issueCode ?? "",
    dayStart: "",
    dayEnd: "",
    pageNo: "1",
    pageSize: "30",
    week: "",
    systemType: "PC",
  });

  try {
    const response = await fetch(
      `${CWL_DRAW_NOTICE_URL}?${params.toString()}`,
      {
        headers: SEARCH_REQUEST_HEADERS,
      },
    );
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        provider: "official-cwl",
        query,
        results: [],
        error: text || `${response.status} ${response.statusText}`,
      };
    }

    const json = JSON.parse(text) as CwlDrawNoticeResponse;
    const results = (json.result ?? [])
      .map((item) => buildCwlResult(item, game))
      .filter((result): result is WebSearchResult => !!result);

    if (results.length === 0) {
      return {
        ok: false,
        provider: "official-cwl",
        query,
        results: [],
        error: json.message || "No official lottery result returned",
      };
    }

    return {
      ok: true,
      provider: "official-cwl",
      query,
      results,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "official-cwl",
      query,
      results: [],
      error:
        error instanceof Error
          ? error.message
          : "Official lottery search failed",
    };
  }
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized.toLowerCase())) {
      return false;
    }

    seen.add(normalized.toLowerCase());
    return true;
  });
}

function buildExpandedQueries(query: string, intent: SearchIntent) {
  if (!intent.isLotteryDrawQuery || !intent.cwlLotteryGame) {
    const officialQueries = OFFICIAL_QUERY_DOMAIN_HINTS.filter((hint) =>
      hint.pattern.test(query),
    ).flatMap((hint) =>
      hint.domains.map((domain) => `site:${domain} ${query}`),
    );

    return uniqueStrings([...officialQueries, query]);
  }

  const issue = intent.issueCode ?? "";
  const gameLabel = intent.cwlLotteryGame.label;

  return uniqueStrings([
    query,
    `site:cwl.gov.cn ${gameLabel} ${issue} 开奖结果`,
    `site:cwl.gov.cn ${gameLabel} ${issue} 开奖公告`,
    `中国福利彩票 ${gameLabel} ${issue} 开奖公告`,
    `site:zhcw.com ${gameLabel} ${issue} 开奖结果`,
  ]);
}

function createSearchResponse(
  provider: WebSearchResponse["provider"],
  query: string,
  results: WebSearchResult[],
  error?: string,
): WebSearchResponse {
  return {
    ok: results.length > 0 && !error,
    provider,
    query,
    results,
    error,
  };
}

function buildDirectOfficialResults(query: string) {
  return DIRECT_OFFICIAL_SOURCE_HINTS.filter((hint) =>
    hint.pattern.test(query),
  ).flatMap((hint) =>
    hint.sources.map((source) => ({
      ...source,
      score: scoreSearchResult(source as WebSearchResult, query, {
        isDefinitionQuery: false,
        isLotteryDrawQuery: false,
      }),
    })),
  );
}

async function searchViaWebPages(
  query: string,
  maxResults: number,
  intent: SearchIntent,
  tavilyApiKey?: string,
): Promise<WebSearchResponse> {
  const expandedQueries = buildExpandedQueries(query, intent);
  const allResults: WebSearchResult[] = buildDirectOfficialResults(query);
  const errors: string[] = [];
  let provider: WebSearchResponse["provider"] = tavilyApiKey
    ? "tavily"
    : "bing-html";

  for (const expandedQuery of expandedQueries) {
    if (tavilyApiKey) {
      const tavilyResult = await searchViaTavily(
        expandedQuery,
        SEARCH_PROVIDER_MAX_RESULTS,
        tavilyApiKey,
      );
      provider = "tavily";

      if (tavilyResult.results.length > 0) {
        allResults.push(...tavilyResult.results);
      }

      if (tavilyResult.error) {
        errors.push(tavilyResult.error);
      }

      if (!intent.isLotteryDrawQuery && allResults.length >= maxResults) {
        break;
      }
    }

    const bingHtmlResult = await searchViaBingHtml(
      expandedQuery,
      SEARCH_PROVIDER_MAX_RESULTS,
    );
    provider = tavilyApiKey && allResults.length > 0 ? "tavily" : "bing-html";

    if (bingHtmlResult.results.length > 0) {
      allResults.push(...bingHtmlResult.results);
    }

    if (bingHtmlResult.error) {
      errors.push(bingHtmlResult.error);
    }

    const rankedResults = rankAndFilterResults(
      allResults,
      query,
      intent,
      maxResults,
    );
    const hasStrongResult = rankedResults.some(
      (result) => (result.score ?? 0) >= (intent.isLotteryDrawQuery ? 90 : 20),
    );

    if (rankedResults.length >= maxResults && hasStrongResult) {
      return createSearchResponse(provider, query, rankedResults);
    }
  }

  const rankedResults = rankAndFilterResults(
    allResults,
    query,
    intent,
    maxResults,
  );
  if (rankedResults.length > 0) {
    return createSearchResponse(provider, query, rankedResults);
  }

  const rssResults: WebSearchResult[] = [];
  for (const expandedQuery of expandedQueries.slice(
    0,
    intent.isLotteryDrawQuery ? 3 : 1,
  )) {
    const bingRssResult = await searchViaBingRss(
      expandedQuery,
      SEARCH_PROVIDER_MAX_RESULTS,
    );
    provider = "bing-rss";

    if (bingRssResult.results.length > 0) {
      rssResults.push(...bingRssResult.results);
    }

    if (bingRssResult.error) {
      errors.push(bingRssResult.error);
    }
  }

  const rankedRssResults = rankAndFilterResults(
    rssResults,
    query,
    intent,
    maxResults,
  );

  return createSearchResponse(
    provider,
    query,
    rankedRssResults,
    rankedRssResults.length > 0
      ? undefined
      : errors.find(Boolean) ?? "No relevant search results returned",
  );
}

function normalizeTavilyResult(
  result: NonNullable<TavilySearchResponse["results"]>[number],
) {
  const title = normalizeText(result?.title);
  const url = result?.url?.trim() ?? "";
  const content = normalizeText(result?.content);

  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    content,
    score: result?.score,
    favicon: result?.favicon?.trim() || undefined,
    publishedAt: result?.published_date?.trim() || undefined,
  } satisfies WebSearchResult;
}

async function searchViaTavily(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<WebSearchResponse> {
  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        auto_parameters: true,
      }),
    });

    const json = (await response.json()) as TavilySearchResponse;

    if (!response.ok) {
      return {
        ok: false,
        provider: "tavily",
        query,
        results: [],
        error:
          json?.error?.toString?.() ||
          `${response.status} ${response.statusText}`,
      };
    }

    const normalizedResults = (json?.results ?? []).reduce<WebSearchResult[]>(
      (allResults, result) => {
        const normalized = normalizeTavilyResult(result);
        if (normalized) {
          allResults.push(normalized);
        }
        return allResults;
      },
      [],
    );

    return {
      ok: true,
      provider: "tavily",
      query,
      results: dedupeResults(normalizedResults),
    };
  } catch (error) {
    return {
      ok: false,
      provider: "tavily",
      query,
      results: [],
      error: error instanceof Error ? error.message : "Web search failed",
    };
  }
}

function extractXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

async function searchViaBingRss(
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  try {
    const response = await fetch(
      `${BING_RSS_SEARCH_URL}${encodeURIComponent(query)}`,
      {
        headers: SEARCH_REQUEST_HEADERS,
      },
    );

    const xml = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        provider: "bing-rss",
        query,
        results: [],
        error: xml || `${response.status} ${response.statusText}`,
      };
    }

    const itemBlocks = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
      .map((match) => match[1])
      .slice(0, maxResults);

    const results = dedupeResults(
      itemBlocks.reduce<WebSearchResult[]>((allResults, block) => {
        const title = normalizeText(extractXmlTag(block, "title"));
        const url = normalizeSearchResultUrl(
          normalizeText(extractXmlTag(block, "link")),
        );
        const content = normalizeText(extractXmlTag(block, "description"));
        const publishedAt = normalizeText(extractXmlTag(block, "pubDate"));

        if (!title || !url) {
          return allResults;
        }

        allResults.push({
          title,
          url,
          content,
          publishedAt: publishedAt || undefined,
        });
        return allResults;
      }, []),
    );

    return {
      ok: true,
      provider: "bing-rss",
      query,
      results,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "bing-rss",
      query,
      results: [],
      error: error instanceof Error ? error.message : "Web search failed",
    };
  }
}

async function searchViaBingHtml(
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  try {
    const response = await fetch(
      `${BING_HTML_SEARCH_URL}${encodeURIComponent(query)}`,
      {
        headers: SEARCH_REQUEST_HEADERS,
      },
    );

    const html = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        provider: "bing-html",
        query,
        results: [],
        error: html || `${response.status} ${response.statusText}`,
      };
    }

    const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) ?? [];

    const results = dedupeResults(
      blocks.reduce<WebSearchResult[]>((allResults, block) => {
        if (allResults.length >= maxResults) {
          return allResults;
        }

        const titleMatch = block.match(
          /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i,
        );

        if (!titleMatch) {
          return allResults;
        }

        const url = normalizeSearchResultUrl(titleMatch[1]?.trim() ?? "");
        const title = normalizeText(titleMatch[2]);
        const snippetMatch = block.match(
          /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
        );
        const content = normalizeText(snippetMatch?.[1]);

        if (!url || !title) {
          return allResults;
        }

        allResults.push({
          title,
          url,
          content,
        });

        return allResults;
      }, []),
    ).slice(0, maxResults);

    return {
      ok: results.length > 0,
      provider: "bing-html",
      query,
      results,
      error: results.length > 0 ? undefined : "No search results returned",
    };
  } catch (error) {
    return {
      ok: false,
      provider: "bing-html",
      query,
      results: [],
      error: error instanceof Error ? error.message : "Web search failed",
    };
  }
}

function looksLikeWeatherQuery(query: string) {
  return /天气|天气预报|气温|温度|下雨|降雨|湿度|风速|体感|几度|多少度|weather|forecast|temperature|rain|humidity|wind/i.test(
    query,
  );
}

function detectWeatherDayOffset(query: string) {
  if (/后天|day after tomorrow/i.test(query)) {
    return 2;
  }

  if (/明天|tomorrow/i.test(query)) {
    return 1;
  }

  return 0;
}

function cleanupWeatherLocationCandidate(candidate: string) {
  let text = candidate.replace(/[?？!！,，.。:：;；]/g, " ");
  const leadingPatterns = [
    /^(帮我查一下|帮我查下|帮我看一下|帮我看下|请帮我|查一下|查下|看一下|看下|看看|帮我|请问|请|麻烦|查询|告诉我|想知道|帮忙|可以|能不能|一下|show me|tell me|check|please)\s*/i,
    /^(今天|今日|明天|后天|现在|当前|今晚|本周|这周|未来三天|未来3天|未来七天|未来7天|today|tomorrow|now|current)\s*/i,
  ];

  let previous = "";
  while (text && text !== previous) {
    previous = text;

    for (const pattern of leadingPatterns) {
      text = text.replace(pattern, "").trim();
    }
  }

  return text
    .replace(
      /(今天|今日|明天|后天|现在|当前|今晚|today|tomorrow|now|current)/gi,
      " ",
    )
    .replace(
      /\s*(的|天气|天气预报|天气情况|气温|温度|下雨|降雨|湿度|风速|体感|几度|多少度|怎么样|如何|好吗|吗|呀|啊|呢|today|tomorrow|now|current)\s*$/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractWeatherLocation(query: string) {
  const trimmed = query.trim();

  const patterns = [
    /(.+?)(?:的)?(?:天气预报|天气情况|天气|气温|温度|湿度|风速|体感|几度|多少度)/i,
    /(.+?)(?:今天|今日|明天|后天|现在|当前|今晚).*(?:会不会)?(?:下雨|降雨)/i,
    /(?:weather|forecast|temperature|humidity|wind)(?:\s+(?:in|for))?\s+([a-z0-9][a-z0-9 ,.'-]*)/i,
    /([a-z0-9][a-z0-9 ,.'-]*)\s+(?:weather|forecast|temperature|humidity|wind)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = cleanupWeatherLocationCandidate(match?.[1] ?? "");
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function formatNumber(value?: number, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "";
  }

  const rounded = Number(value.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function describeWeatherCode(code?: number) {
  switch (code) {
    case 0:
      return "晴";
    case 1:
      return "大致晴朗";
    case 2:
      return "局部多云";
    case 3:
      return "阴";
    case 45:
    case 48:
      return "有雾";
    case 51:
      return "小毛毛雨";
    case 53:
      return "毛毛雨";
    case 55:
      return "强毛毛雨";
    case 56:
    case 57:
      return "冻毛毛雨";
    case 61:
      return "小雨";
    case 63:
      return "中雨";
    case 65:
      return "大雨";
    case 66:
    case 67:
      return "冻雨";
    case 71:
      return "小雪";
    case 73:
      return "中雪";
    case 75:
      return "大雪";
    case 77:
      return "雪粒";
    case 80:
      return "小阵雨";
    case 81:
      return "阵雨";
    case 82:
      return "强阵雨";
    case 85:
      return "小阵雪";
    case 86:
      return "强阵雪";
    case 95:
      return "雷暴";
    case 96:
    case 99:
      return "雷暴伴冰雹";
    default:
      return "天气未知";
  }
}

function getDayLabel(index: number) {
  if (index === 0) {
    return "今天";
  }

  if (index === 1) {
    return "明天";
  }

  if (index === 2) {
    return "后天";
  }

  return `第${index + 1}天`;
}

function buildWeatherLocationLabel(
  location: NonNullable<OpenMeteoGeocodingResponse["results"]>[number],
) {
  const parts = [location.name];

  if (location.admin1 && location.admin1 !== location.name) {
    parts.push(location.admin1);
  }

  if (location.country && location.country !== location.admin1) {
    parts.push(location.country);
  }

  return parts.filter(Boolean).join(", ");
}

async function searchWeatherViaOpenMeteo(
  query: string,
): Promise<WebSearchResponse | null> {
  if (!looksLikeWeatherQuery(query)) {
    return null;
  }

  const locationQuery = extractWeatherLocation(query);
  if (!locationQuery) {
    return null;
  }

  const requestedDayOffset = detectWeatherDayOffset(query);

  try {
    const geocodingUrl =
      `${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(locationQuery)}` +
      "&count=5&language=zh&format=json";
    const geocodingResponse = await fetch(geocodingUrl, {
      headers: SEARCH_REQUEST_HEADERS,
    });

    if (!geocodingResponse.ok) {
      return {
        ok: false,
        provider: "open-meteo",
        query,
        results: [],
        error: `${geocodingResponse.status} ${geocodingResponse.statusText}`,
      };
    }

    const geocodingJson =
      (await geocodingResponse.json()) as OpenMeteoGeocodingResponse;
    const location = (geocodingJson.results ?? [])
      .slice()
      .sort((left, right) => (right.population ?? 0) - (left.population ?? 0))
      .find(
        (item) =>
          typeof item.latitude === "number" &&
          typeof item.longitude === "number",
      );

    if (!location) {
      return null;
    }

    const forecastUrl =
      `${OPEN_METEO_FORECAST_URL}?latitude=${location.latitude}&longitude=${location.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=3";
    const forecastResponse = await fetch(forecastUrl, {
      headers: SEARCH_REQUEST_HEADERS,
    });

    if (!forecastResponse.ok) {
      return {
        ok: false,
        provider: "open-meteo",
        query,
        results: [],
        error: `${forecastResponse.status} ${forecastResponse.statusText}`,
      };
    }

    const forecastJson =
      (await forecastResponse.json()) as OpenMeteoForecastResponse;
    const locationLabel = buildWeatherLocationLabel(location);
    const current = forecastJson.current;
    const daily = forecastJson.daily;

    if (!current || !daily?.time?.length) {
      return {
        ok: false,
        provider: "open-meteo",
        query,
        results: [],
        error: "Weather data is incomplete",
      };
    }

    const requestedIndex = Math.min(
      requestedDayOffset,
      Math.max(daily.time.length - 1, 0),
    );
    const requestedSummary = daily.time
      .map((date, index) => {
        const weather = describeWeatherCode(daily.weather_code?.[index]);
        const minTemp = formatNumber(daily.temperature_2m_min?.[index], 1);
        const maxTemp = formatNumber(daily.temperature_2m_max?.[index], 1);
        const precipitation = formatNumber(
          daily.precipitation_probability_max?.[index],
          0,
        );

        return `${date}（${getDayLabel(
          index,
        )}）${weather}，${minTemp}°C - ${maxTemp}°C，降水概率 ${precipitation}%`;
      })
      .slice(0, 3);

    const results: WebSearchResult[] = [
      {
        title: `${locationLabel} 当前天气（Open-Meteo）`,
        url: forecastUrl,
        content:
          `当前 ${describeWeatherCode(
            current.weather_code,
          )}，气温 ${formatNumber(current.temperature_2m, 1)}°C，` +
          `体感 ${formatNumber(current.apparent_temperature, 1)}°C，` +
          `湿度 ${formatNumber(current.relative_humidity_2m, 0)}%，` +
          `风速 ${formatNumber(current.wind_speed_10m, 1)} km/h，` +
          `降水 ${formatNumber(current.precipitation, 1)} mm。` +
          (current.time ? ` 数据时间 ${current.time.replace("T", " ")}。` : ""),
      },
      {
        title: `${locationLabel} ${getDayLabel(
          requestedIndex,
        )}天气预报（Open-Meteo）`,
        url: forecastUrl,
        content:
          `重点：${requestedSummary[requestedIndex]}. ` +
          `未来天气：${requestedSummary.join("；")}。`,
      },
    ];

    return {
      ok: true,
      provider: "open-meteo",
      query,
      results,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "open-meteo",
      query,
      results: [],
      error: error instanceof Error ? error.message : "Weather search failed",
    };
  }
}

export async function searchWeb(
  rawQuery: string,
  options?: {
    maxResults?: number;
    tavilyApiKey?: string;
  },
): Promise<WebSearchResponse> {
  const query = rawQuery.trim();
  const serverConfig = getServerSideConfig();
  const tavilyApiKey =
    options?.tavilyApiKey?.trim() || serverConfig.tavilyApiKey;
  const maxResults = Math.max(
    1,
    Math.min(options?.maxResults ?? DEFAULT_WEB_SEARCH_MAX_RESULTS, 10),
  );

  if (!query) {
    return {
      ok: false,
      provider: tavilyApiKey ? "tavily" : "bing-html",
      query,
      results: [],
      error: "Missing search query",
    };
  }

  const intent = detectSearchIntent(query);
  const weatherResult = await searchWeatherViaOpenMeteo(query);
  if (weatherResult?.ok || weatherResult?.results.length) {
    return weatherResult;
  }

  const officialCwlResult = await searchOfficialCwlLottery(query, intent);
  if (officialCwlResult?.ok || officialCwlResult?.results.length) {
    return officialCwlResult;
  }

  const zhcwResult = await searchZhcwLottery(query, intent);
  if (zhcwResult?.ok || zhcwResult?.results.length) {
    return zhcwResult;
  }

  const webPageResult = await searchViaWebPages(
    query,
    maxResults,
    intent,
    tavilyApiKey,
  );
  if (webPageResult.ok || webPageResult.results.length > 0) {
    return webPageResult;
  }

  return (
    weatherResult ??
    officialCwlResult ??
    zhcwResult ??
    webPageResult ?? {
      ok: false,
      provider: "bing-html",
      query,
      results: [],
      error: "Web search failed",
    }
  );
}
