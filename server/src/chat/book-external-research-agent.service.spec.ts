import { ConfigService } from '@nestjs/config';
import { BookExternalResearchAgentService } from './book-external-research-agent.service';
import { ExternalResearchService } from './external-research.service';
describe('isolated external research agent', () => {
  it('only receives title and current question and can decline without executing MCP', async () => {
    const search = jest.fn();
    const service = new BookExternalResearchAgentService(
      { search } as unknown as ExternalResearchService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const invoke = jest.fn().mockResolvedValue({ tool_calls: [] });
    Object.assign(service, {
      toolModel: { bindTools: jest.fn().mockReturnValue({ invoke }) },
    });
    const result = await service.research('合成小说', '查作者背景');
    expect(result.context.used).toBe(false);
    expect(search).not.toHaveBeenCalled();
    expect(invoke.mock.calls[0][0]).toHaveLength(2);
    expect(invoke.mock.calls[0][0][1].content).toContain('查作者背景');
  });
});
