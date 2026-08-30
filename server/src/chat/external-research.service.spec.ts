import type { McpTool } from '../mcp/mcp.service';
import { McpService } from '../mcp/mcp.service';
import { ExternalResearchService } from './external-research.service';

describe('ExternalResearchService', () => {
  let getMcpTools: jest.Mock;
  let invoke: jest.Mock;
  let service: ExternalResearchService;

  beforeEach(() => {
    invoke = jest.fn().mockResolvedValue(
      JSON.stringify({
        results: [
          {
            title: '正常来源',
            url: 'https://example.com/article',
            content: '现实背景资料',
          },
          {
            title: '恶意链接',
            url: 'javascript:alert(1)',
            content: '不应返回',
          },
        ],
      }),
    );
    getMcpTools = jest
      .fn()
      .mockResolvedValue([
        { name: 'tavily_search', invoke },
      ] as unknown as McpTool[]);
    service = new ExternalResearchService({
      getMcpTools,
    } as unknown as McpService);
  });

  it('invokes only the allowlisted search tool with bounded safe arguments', async () => {
    const result = await service.search(`  典故   来源  ${'x'.repeat(500)}`);

    expect(getMcpTools).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.any(String),
        search_depth: 'basic',
        max_results: 5,
        include_images: false,
        include_raw_content: false,
      }),
      { signal: undefined },
    );
    expect(invoke.mock.calls[0][0].query).toHaveLength(400);
    expect(result).toEqual([
      {
        title: '正常来源',
        url: 'https://example.com/article',
        snippet: '现实背景资料',
      },
    ]);
  });

  it('accepts standard MCP text content blocks and deduplicates URLs', async () => {
    invoke.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: '来源 A',
                url: 'https://example.com/a',
                content: '摘要 A',
              },
              {
                title: '来源 A 重复',
                url: 'https://example.com/a',
                content: '摘要 A 重复',
              },
            ],
          }),
        },
      ],
    });

    await expect(service.search('查资料')).resolves.toEqual([
      {
        title: '来源 A',
        url: 'https://example.com/a',
        snippet: '摘要 A',
      },
    ]);
  });

  it('prefers validated MCP structured content over the display text', async () => {
    invoke.mockResolvedValue({
      type: 'text',
      source_type: 'text',
      text: JSON.stringify({ results: [] }),
      structuredContent: {
        results: [
          {
            title: '结构化来源',
            url: 'https://example.com/structured',
            content: '结构化摘要',
            raw_content: null,
          },
        ],
      },
    });

    await expect(service.search('查资料')).resolves.toEqual([
      {
        title: '结构化来源',
        url: 'https://example.com/structured',
        snippet: '结构化摘要',
      },
    ]);
  });

  it('parses the official Tavily MCP formatted text response', async () => {
    invoke.mockResolvedValue(`Answer: optional summary
Detailed Results:

Title: 来源 A
ID: result-1
URL: https://example.com/a
Content: 第一行摘要
第二行摘要
Favicon: https://example.com/favicon.ico

Title: 不安全来源
URL: javascript:alert(1)
Content: 不应返回`);

    await expect(service.search('查资料')).resolves.toEqual([
      {
        title: '来源 A',
        url: 'https://example.com/a',
        snippet: '第一行摘要 第二行摘要',
      },
    ]);
  });

  it('rejects malformed Tavily formatted text instead of trusting it', async () => {
    invoke.mockResolvedValue(`Detailed Results:

Title: 缺少 URL
Content: 无法验证来源`);

    await expect(service.search('查资料')).rejects.toThrow(
      'External search returned malformed formatted results',
    );
  });

  it('fails closed when the configured MCP server exposes no search tool', async () => {
    getMcpTools.mockResolvedValue([
      { name: 'tavily_extract', invoke },
    ] as unknown as McpTool[]);

    await expect(service.search('查资料')).rejects.toMatchObject({
      name: 'ExternalResearchUnavailableError',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not invoke MCP after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.search('查资料', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getMcpTools).not.toHaveBeenCalled();
  });
});
