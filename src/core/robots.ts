import robotsParser from 'robots-parser';
import { userAgent } from '../config.ts';
import { rateLimitedFetch } from './rateLimitedFetch.ts';
import type { Logger } from './logger.ts';

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
}

export class RobotsGate {
  private robots = new Map<string, Robot | null>();

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private async getRobot(origin: string): Promise<Robot | null> {
    if (this.robots.has(origin)) return this.robots.get(origin) ?? null;

    const robotsUrl = `${origin}/robots.txt`;
    let robot: Robot | null = null;
    try {
      const res = await rateLimitedFetch(robotsUrl, this.logger, { timeoutMs: 10_000 });
      const body = res.status >= 200 && res.status < 300 ? res.body : '';
      robot = robotsParser(robotsUrl, body);
    } catch (err) {
      this.logger.warn(`Failed to fetch robots.txt for ${origin}, allowing by default`, {
        error: String(err),
      });
      robot = null;
    }
    this.robots.set(origin, robot);
    return robot;
  }

  async isAllowed(url: string): Promise<boolean> {
    const parsed = new URL(url);
    const robot = await this.getRobot(parsed.origin);
    if (!robot) return true;
    return robot.isAllowed(url, userAgent) !== false;
  }
}
