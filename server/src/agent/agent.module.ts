import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { MilvusModule } from '../milvus/milvus.module';
import { McpModule } from '../mcp/mcp.module';
import { ToolsModule } from '../tools/tools.module';
import { PersonaModule } from '../persona/persona.module';

@Module({
  imports: [MilvusModule, McpModule, ToolsModule, PersonaModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
