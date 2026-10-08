import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TarotController } from './tarot.controller';
import { TarotAuthGuard } from './tarot-auth.guard';
import { TarotStateService } from './tarot-state.service';
import { TarotProviderService } from './tarot-provider.service';

@Module({
  imports: [AuthModule],
  controllers: [TarotController],
  providers: [TarotAuthGuard, TarotStateService, TarotProviderService],
})
export class TarotModule {}
