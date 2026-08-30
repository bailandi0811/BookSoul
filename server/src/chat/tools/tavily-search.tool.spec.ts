import { createTavilySearchTool } from './tavily-search.tool';

describe('tavily_search agent tool', () => {
  it('validates the model query before executing the MCP adapter', async () => {
    const execute = jest.fn().mockResolvedValue([
      {
        title: '来源',
        url: 'https://example.com/source',
        snippet: '摘要',
      },
    ]);
    const searchTool = createTavilySearchTool(execute);

    await expect(
      searchTool.invoke({ query: '  作者的现实经历  ' }),
    ).resolves.toEqual([
      {
        title: '来源',
        url: 'https://example.com/source',
        snippet: '摘要',
      },
    ]);
    expect(execute.mock.calls[0][0]).toEqual({ query: '作者的现实经历' });
  });

  it('rejects empty, oversized, and unexpected tool arguments', async () => {
    const execute = jest.fn();
    const searchTool = createTavilySearchTool(execute);

    await expect(searchTool.invoke({ query: ' ' })).rejects.toThrow();
    await expect(
      searchTool.invoke({ query: 'x'.repeat(401) }),
    ).rejects.toThrow();
    await expect(
      searchTool.invoke({ query: '作者', privateText: '小说原文' }),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
