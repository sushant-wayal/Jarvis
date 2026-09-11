import { z } from 'zod';
import { JarvisTool } from './types';

export interface SearchResult {
  query: string;
  results: Array<{
    title: string;
    snippet: string;
    url?: string;
  }>;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult>;
}

class DuckDuckGoSearchProvider implements SearchProvider {
  async search(query: string): Promise<SearchResult> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const html = await response.text();
      const results: Array<{ title: string; snippet: string; url?: string }> = [];

      // Extract search snippets cleanly
      const matches = [...html.matchAll(/<a class="result__snippet[^>]*>(.*?)<\/a>/gi)];
      const titleMatches = [...html.matchAll(/<a class="result__url[^>]*>(.*?)<\/a>/gi)];

      for (let i = 0; i < Math.min(matches.length, 3); i++) {
        const snippet = matches[i][1].replace(/<[^>]+>/g, '').trim();
        const title = titleMatches[i] ? titleMatches[i][1].replace(/<[^>]+>/g, '').trim() : query;
        if (snippet) {
          results.push({ title, snippet });
        }
      }

      if (results.length > 0) {
        return { query, results };
      }

      return this.fallbackSearch(query);
    } catch {
      return this.fallbackSearch(query);
    }
  }

  private fallbackSearch(query: string): SearchResult {
    return {
      query,
      results: [],
    };
  }
}

const WebSearchInputSchema = z.object({
  query: z
    .string()
    .describe('Search query for current real-world information, facts, news, or lookups.'),
});

const defaultSearchProvider: SearchProvider = new DuckDuckGoSearchProvider();

export const webSearchTool: JarvisTool<z.infer<typeof WebSearchInputSchema>, SearchResult> = {
  name: 'web_search',
  description: 'Searches the web for up-to-date real-world facts, news, entity details, or live information.',
  category: 'SEARCH',
  riskLevel: 'SAFE',
  inputSchema: WebSearchInputSchema,
  async execute(input) {
    return await defaultSearchProvider.search(input.query);
  },
};
