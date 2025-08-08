import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web for information using a search query',
  inputSchema: z.object({
    query: z.string().describe('The search query to look for'),
    maxResults: z.number().optional().default(5).describe('Maximum number of search results to return'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string(),
      relevance: z.number().describe('Relevance score from 0 to 1'),
    })),
    totalResults: z.number(),
    searchQuery: z.string(),
  }),
  execute: async ({ context }) => {
    // For now, return mock data since we don't have actual search API configured
    // In production, this would integrate with Google Search API, Bing API, or similar
    const mockResults = [
      {
        title: `Results for "${context.query}"`,
        url: 'https://example.com/search-result-1',
        snippet: `This is a mock search result for the query: ${context.query}. In a real implementation, this would contain actual search results from a web search API.`,
        relevance: 0.9,
      },
      {
        title: `Related information about ${context.query}`,
        url: 'https://example.com/search-result-2',
        snippet: `Additional context and information related to ${context.query} would appear here in actual search results.`,
        relevance: 0.7,
      },
    ];

    return {
      results: mockResults.slice(0, context.maxResults || 5),
      totalResults: mockResults.length,
      searchQuery: context.query,
    };
  },
});
