/**
 * Event emit helpers for debug log.
 * Keep this module dependency-light so core modules can import it.
 */
import { log } from '../log/buffer';

export function logEvent(kind: string, data?: unknown): void {
  log(kind, data);
}

export function logSeek(data: unknown): void { log('seek', data); }
export function logJump(data: unknown): void { log('jump', data); }
export function logAd(active: boolean): void { log('ad', { active }); }
export function logStatus(status: string, details?: unknown): void { log('status', { status, details }); }

