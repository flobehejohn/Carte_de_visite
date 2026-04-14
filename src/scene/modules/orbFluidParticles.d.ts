export type FluidParticlesContext = Record<string, unknown>;
export type FluidParticlesConfigPatch = Record<string, unknown>;
export type FluidParticlesHandle = unknown;

export const ORB_BASE_RENDER_LAYER: number;
export const ORB_OVERLAY_RENDER_LAYER: number;

export function ensureFluidParticlesConfig(
  ctx: FluidParticlesContext,
): FluidParticlesContext;

export function resetFluidParticles(ctx: FluidParticlesContext): void;

export function buildFluidParticles(
  ctx: FluidParticlesContext,
): FluidParticlesHandle | null;

export function setFluidParticlesEnabled(
  ctx: FluidParticlesContext,
  enabled: boolean,
): FluidParticlesHandle | void;

export function setFluidParticlesConfig(
  ctx: FluidParticlesContext,
  patch?: FluidParticlesConfigPatch,
): FluidParticlesContext;

export function updateFluidParticles(
  ctx: FluidParticlesContext,
  delta?: number,
): void;
