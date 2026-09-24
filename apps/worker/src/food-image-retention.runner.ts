import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { FoodImageRetentionService } from '@atlas/backend';

export class FoodImageRetentionRunner implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopping = false;
  constructor(
    private readonly retention: FoodImageRetentionService,
    private readonly enabled: boolean,
  ) {}
  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => this.poll(), 60_000);
    this.timer.unref();
    this.poll();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  private poll(): void {
    if (this.stopping || this.active) return;
    this.active = this.run()
      .catch(() =>
        console.error(
          JSON.stringify({
            event: 'food_image_retention_error',
            errorCategory: 'dependencyUnavailable',
          }),
        ),
      )
      .finally(() => {
        this.active = undefined;
      });
  }
  private async run(): Promise<void> {
    const summary = await this.retention.enqueueDue();
    if (summary.skippedUnknownTerminalTime)
      console.warn(
        JSON.stringify({
          event: 'food_image_retention_missing_terminal_time',
          count: summary.skippedUnknownTerminalTime,
        }),
      );
    for (let count = 0; count < 20 && !this.stopping; count++)
      if (!(await this.retention.processOne())) break;
  }
}
