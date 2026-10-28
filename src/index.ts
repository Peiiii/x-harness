import { ProfilePin, type PinTab } from "./profile-pin.js";
export type { PinOptions, PinResult } from "./profile-pin.js";
import { bindXGrowthHarness } from "./binding.js";
import { HostConnection } from "./host-connection.js";
import type {
  HarnessOptions,
  XGrowthHarness,
  HostConnectionOptions,
  HostConnectionResult,
} from "./types.js";
export type * from "./types.js";

/** Bind a selected real CUA handle once. Construction performs no browser I/O. */
export function createXGrowthHarness(options: HarnessOptions): XGrowthHarness;
/** Initialize a supported host read, recover once, then open exactly one owned tab. */
export function createXGrowthHarness(
  options: HostConnectionOptions,
): Promise<HostConnectionResult>;
export function createXGrowthHarness(
  options: HarnessOptions | HostConnectionOptions,
): XGrowthHarness | Promise<HostConnectionResult> {
  return "connection" in options
    ? new HostConnection(options).connect()
    : bindXGrowthHarness(options);
}
// Project binders can refuse older factories that silently ignore this guard.
Object.defineProperty(createXGrowthHarness, "originalContentGuardVersion", {
  value: 1,
});
Object.defineProperty(createXGrowthHarness, "originalPostActivationVersion", {
  value: 1,
});
