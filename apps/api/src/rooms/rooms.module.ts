import { Module } from '@nestjs/common';

import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import { RoomStore } from './rooms.store';

@Module({
  providers: [RoomsGateway, RoomsService, RoomStore],
  exports: [RoomsService],
})
export class RoomsModule {}
