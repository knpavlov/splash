import { DateTime } from 'luxon';
import type { SnapshotsService } from './snapshots.service.js';

const MAX_TIMEOUT_MS = 0x7fffffff;

const resolveZone = (timezone: string) => {
  const zone = timezone && timezone.trim() ? timezone.trim() : 'Australia/Sydney';
  const probe = DateTime.now().setZone(zone);
  return probe.isValid ? zone : 'Australia/Sydney';
};

export class SnapshotScheduler {
  private timer: NodeJS.Timeout | null = null;
  private nextRun: Date | null = null;
  private started = false;

  constructor(private readonly service: SnapshotsService) {}

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.scheduleNext();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRun = null;
    this.started = false;
  }

  async refresh() {
    if (!this.started) {
      return;
    }
    await this.scheduleNext();
  }

  getNextRunTime() {
    return this.nextRun;
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async scheduleNext() {
    this.clearTimer();
    const settings = await this.service.getRawSettings();
    if (!settings.enabled) {
      this.nextRun = null;
      return;
    }
    const timezone = resolveZone(settings.timezone);
    const now = DateTime.now().setZone(timezone);
    let target = now.set({
      hour: Number.isFinite(settings.scheduleHour) ? settings.scheduleHour : 19,
      minute: Number.isFinite(settings.scheduleMinute) ? settings.scheduleMinute : 0,
      second: 0,
      millisecond: 0
    });
    if (target <= now.plus({ minutes: 1 })) {
      target = target.plus({ days: 1 });
    }
    this.nextRun = target.toJSDate();
    const delay = Math.max(0, target.toMillis() - Date.now());
    this.timer = this.createTimer(delay);
  }

  private createTimer(delay: number): NodeJS.Timeout {
    if (delay <= MAX_TIMEOUT_MS) {
      return setTimeout(() => {
        void this.execute();
      }, delay);
    }
    return setTimeout(() => {
      this.timer = this.createTimer(delay - MAX_TIMEOUT_MS);
    }, MAX_TIMEOUT_MS);
  }

  private async execute() {
    try {
      await this.service.captureProgramSnapshot('auto', 'full');
    } catch (error) {
      console.error('Automatic snapshot failed:', error);
    } finally {
      await this.scheduleNext();
    }
  }
}
