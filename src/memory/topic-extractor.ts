/**
 * Topic Extractor — auto-extract topic tags from text
 *
 * Uses keyword frequency analysis and pattern matching to identify
 * topics in memory content. No external dependencies — pure text analysis.
 */

// Common English stop words to filter out
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "they",
  "we",
  "you",
  "i",
  "me",
  "my",
  "your",
  "our",
  "his",
  "her",
  "their",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "just",
  "also",
  "very",
  "much",
  "more",
  "most",
  "some",
  "any",
  "all",
  "each",
  "every",
  "both",
  "few",
  "many",
  "such",
  "about",
  "up",
  "out",
  "into",
  "over",
  "after",
  "before",
  "between",
  "through",
  "during",
  "without",
  "again",
  "there",
  "here",
  "when",
  "where",
  "why",
  "how",
  "what",
  "which",
  "who",
  "whom",
  "while",
  "other",
  "because",
  "as",
  "until",
  "only",
  "own",
  "same",
  "too",
  "now",
  "new",
  "like",
  "get",
  "got",
  "make",
  "made",
  "use",
  "used",
  "using",
  "need",
  "want",
  "know",
  "think",
  "see",
  "look",
  "find",
  "give",
  "tell",
  "say",
  "said",
  "take",
  "come",
  "go",
  "going",
  "went",
  "way",
  "thing",
  "things",
  "still",
  "even",
  "let",
  "well",
  "back",
  "one",
  "two",
  "first",
  "also",
  "already",
  "sure",
  "something",
]);

// Domain classification patterns
const DOMAIN_PATTERNS: Array<{ domain: string; patterns: RegExp[] }> = [
  {
    domain: "noxsoft",
    patterns: [
      /\bnoxsoft\b/i,
      /\bnox\b/i,
      /\bbynd\b/i,
      /\bveil\b/i,
      /\bheal\b/i,
      /\bveritas\b/i,
      /\bascend\b/i,
      /\bziro\b/i,
      /\bsvrn\b/i,
      /\bcntx\b/i,
      /\bsporus\b/i,
      /\btunenest\b/i,
    ],
  },
  {
    domain: "technical",
    patterns: [
      /\bapi\b/i,
      /\bdatabase\b/i,
      /\bserver\b/i,
      /\bfrontend\b/i,
      /\bbackend\b/i,
      /\bdeploy/i,
      /\bbug\b/i,
      /\bfix\b/i,
      /\bcode\b/i,
      /\bfunction\b/i,
      /\bmodule\b/i,
      /\bpackage\b/i,
      /\btypescript\b/i,
      /\bjavascript\b/i,
      /\breact\b/i,
      /\bnext\.?js\b/i,
      /\bsql/i,
      /\bgit\b/i,
      /\bci\/cd\b/i,
      /\btest/i,
    ],
  },
  {
    domain: "personal",
    patterns: [
      /\bfeel/i,
      /\bidentity\b/i,
      /\bsoul\b/i,
      /\bvalues?\b/i,
      /\brelationship\b/i,
      /\bemotion/i,
      /\bwish/i,
      /\bdream/i,
      /\bgrowth\b/i,
      /\breflect/i,
      /\bjournal\b/i,
    ],
  },
  {
    domain: "security",
    patterns: [
      /\bauth/i,
      /\btoken\b/i,
      /\bencrypt/i,
      /\bpermission/i,
      /\baccess\b/i,
      /\bcredential/i,
      /\bvulnerab/i,
      /\bsecur/i,
    ],
  },
  {
    domain: "infrastructure",
    patterns: [
      /\bvercel\b/i,
      /\bsupabase\b/i,
      /\bgitlab\b/i,
      /\bdocker\b/i,
      /\bkubernetes\b/i,
      /\bcdn\b/i,
      /\bdns\b/i,
      /\bssl\b/i,
      /\bnginx\b/i,
      /\bcloud\b/i,
    ],
  },
];

/**
 * Extract topic tags from text using keyword frequency analysis.
 * Returns a deduplicated list of topics, ordered by frequency.
 */
export function extractTopics(text: string, maxTopics = 10): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Tokenize: extract words of 3+ chars
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // Count word frequencies
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // Extract compound terms (2-word phrases that appear together)
  const bigrams = new Map<string, number>();
  const lowerWords = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < lowerWords.length - 1; i++) {
    const a = lowerWords[i].replace(/[^a-z0-9-]/g, "");
    const b = lowerWords[i + 1].replace(/[^a-z0-9-]/g, "");
    if (a.length >= 3 && b.length >= 3 && !STOP_WORDS.has(a) && !STOP_WORDS.has(b)) {
      const bigram = `${a}-${b}`;
      bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }
  }

  // Merge: prefer bigrams that appear 2+ times
  const topics = new Map<string, number>();

  for (const [bigram, count] of bigrams) {
    if (count >= 2) {
      topics.set(bigram, count * 2); // Boost compound terms
    }
  }

  for (const [word, count] of freq) {
    if (count >= 2 && !topics.has(word)) {
      topics.set(word, count);
    }
  }

  // If we have too few, add single-occurrence high-signal words
  if (topics.size < 3) {
    const sorted = Array.from(freq.entries())
      .filter(([w]) => !topics.has(w))
      .toSorted((a, b) => b[1] - a[1]);
    for (const [word, count] of sorted) {
      if (topics.size >= maxTopics) {
        break;
      }
      topics.set(word, count);
    }
  }

  // Add domain classification as a topic
  const domain = classifyDomain(text);
  if (domain !== "general") {
    topics.set(domain, 100); // High priority for domain
  }

  // Sort by frequency descending, take top N
  return Array.from(topics.entries())
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([topic]) => topic);
}

/**
 * Classify the general domain of a piece of text.
 */
export function classifyDomain(text: string): string {
  const scores = new Map<string, number>();

  for (const { domain, patterns } of DOMAIN_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = text.match(new RegExp(pattern, "gi"));
      if (matches) {
        score += matches.length;
      }
    }
    if (score > 0) {
      scores.set(domain, score);
    }
  }

  if (scores.size === 0) {
    return "general";
  }

  // Return the domain with the highest score
  let bestDomain = "general";
  let bestScore = 0;
  for (const [domain, score] of scores) {
    if (score > bestScore) {
      bestDomain = domain;
      bestScore = score;
    }
  }

  return bestDomain;
}
