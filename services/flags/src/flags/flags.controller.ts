import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { UpdateFlagRequestSchema, type FeatureFlag } from '@arena/contracts';
import { AdminGuard } from '@arena/service-auth';
import { FlagsService } from './flags.service';

@Controller('flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  list(): Promise<FeatureFlag[]> {
    return this.flags.list();
  }

  @Put(':key')
  @UseGuards(AdminGuard)
  update(@Param('key') key: string, @Body() body: unknown): Promise<FeatureFlag> {
    const parsed = UpdateFlagRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.flags.update(key, parsed.data.enabled);
  }
}
