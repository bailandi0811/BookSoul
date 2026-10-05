import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { CommunityEventsService } from './community.events.service';
import { CommunityTicketsService } from './community.tickets.service';
import { CommunityTicketGuard } from './community-ticket.guard';
import { CommunityGateway } from './community.gateway';
import { CommunityModerationService } from './community.moderation.service';
import { CommunityMembersService } from './community-members.service';
import { UserProfileModule } from '../users/profile/user-profile.module';

@Module({
  imports: [AuthModule, UserProfileModule],
  controllers: [CommunityController],
  providers: [
    CommunityService,
    CommunityMembersService,
    CommunityEventsService,
    CommunityTicketsService,
    CommunityTicketGuard,
    CommunityGateway,
    CommunityModerationService,
  ],
  exports: [CommunityTicketsService],
})
export class CommunityModule {}
