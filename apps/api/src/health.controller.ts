import { Controller, Get } from '@nestjs/common';

/** Liveness probe, handy for checking the dev server actually came up. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
