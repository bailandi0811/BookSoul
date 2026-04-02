import { Module, Global } from '@nestjs/common';
import { PersonaService } from './persona.service';

@Global()
@Module({
  providers: [PersonaService],
  exports: [PersonaService],
})
export class PersonaModule {}
