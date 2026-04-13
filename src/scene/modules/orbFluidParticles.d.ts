export type FluidParticlesContext = Record<string, unknown>;
export type FluidParticlesConfig = Record<string, unknown>;
export type FluidParticlesConfigPatch = Record<string, unknown>;
export type FluidParticlesHandle = unknown;

export const ORB_BASE_RENDER_LAYER: number;
export const ORB_OVERLAY_RENDER_LAYER: number;

export function ensureFluidParticlesConfig(
  ctx: FluidParticlesContext,
): FluidParticlesConfig;

export function resetFluidParticles(ctx: FluidParticlesContext): void;

export function initFluidParticles(
  ctx: FluidParticlesContext,
): FluidParticlesHandle | null;

export function buildFluidParticles(
  ctx: FluidParticlesContext,
): FluidParticlesHandle;

export function setFluidParticlesEnabled(
  ctx: FluidParticlesContext,
  enabled: boolean,
): FluidParticlesConfig;

export function setFluidParticlesConfig(
  ctx: FluidParticlesContext,
  patch?: FluidParticlesConfigPatch,
): FluidParticlesConfig;

export function updateFluidParticles(
  ctx: FluidParticlesContext,
  delta?: number,
): void;
