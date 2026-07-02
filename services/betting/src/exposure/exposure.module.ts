import { Module } from '@nestjs/common';
import { ExposureController } from './exposure.controller';
import { ExposureService } from './exposure.service';

@Module({
  controllers: [ExposureController],
  providers: [ExposureService],
})
export class ExposureModule {}
