import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { UpdateFlagRequestSchema, type FeatureFlag } from '@arena/contracts';
import { FlagsService } from './flags.service';
import { FlagsWriteGuard } from './flags-write.guard';

@Controller('flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  list(): Promise<FeatureFlag[]> {
    return this.flags.list();
  }

  @Put(':key')
  @UseGuards(FlagsWriteGuard)
  update(@Param('key') key: string, @Body() body: unknown): Promise<FeatureFlag> {
    const parsed = UpdateFlagRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.flags.update(key, parsed.data.enabled);
  }
}
