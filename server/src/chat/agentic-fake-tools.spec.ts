import { createAgenticAcceptanceTools } from '../../test/agentic-fake-tools';
describe('isolated acceptance tools', () => {
  it('uses fake MCP and SMTP without outbound calls', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network authorized'));
    try {
      const fake = createAgenticAcceptanceTools();
      const tools = await fake.mcp.getMcpTools();
      await tools[0].invoke({ query: 'synthetic' });
      await expect(fake.mailer.sendMail()).resolves.toMatchObject({
        messageId: 'fixture-mail',
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
