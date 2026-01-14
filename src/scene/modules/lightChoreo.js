const DEFAULT_CONFIG = {
  enabled: false,
  mode: 'none',
  waveform: 'sine',
  amplitude: 1,
  speed: 0.6,
  phase: 0,
  center: { x: 0, y: 0, z: 0 }
};

function ensureState(ctx) {
  if (!ctx.lightChoreoConfig) ctx.lightChoreoConfig = {};
  return ctx.lightChoreoConfig;
}

function cloneConfig(cfg) {
  return {
    ...cfg,
    center: { x: cfg.center.x, y: cfg.center.y, z: cfg.center.z }
  };
}

function normCenter(center, fallback) {
  return {
    x: center?.x ?? fallback.x ?? 0,
    y: center?.y ?? fallback.y ?? 0,
    z: center?.z ?? fallback.z ?? 0
  };
}

function evalWaveform(type, t) {
  const period = Math.PI * 2;
  const mod = ((t % period) + period) % period;
  const normalized = mod / period;
  switch (type) {
    case 'triangle': {
      const tri = 4 * Math.abs(normalized - 0.5) - 1;
      return tri;
    }
    case 'square':
      return normalized < 0.5 ? 1 : -1;
    case 'sine':
    default:
      return Math.sin(t);
  }
}

export function setLightChoreoConfig(ctx, id, partial = {}) {
  const state = ensureState(ctx);
  const prev = state[id]
    ? cloneConfig(state[id])
    : cloneConfig(DEFAULT_CONFIG);
  const next = {
    ...prev,
    ...partial
  };
  next.center = normCenter(partial.center, prev.center);
  state[id] = next;
  console.info(
    `[LightChoreo] ${id} mode=${next.mode} waveform=${next.waveform} amp=${next.amplitude}`
  );
  return cloneConfig(next);
}

export function getLightChoreoConfig(ctx, id) {
  const state = ensureState(ctx);
  if (!state[id]) return null;
  return cloneConfig(state[id]);
}

function getEntry(ctx, id) {
  if (!ctx.lightsRegistry) return null;
  if (ctx.lightsRegistry instanceof Map) return ctx.lightsRegistry.get(id);
  if (Array.isArray(ctx.lightsRegistry)) {
    return ctx.lightsRegistry.find(entry => entry.id === id);
  }
  return null;
}

export function updateLightChoreographies(ctx, time) {
  const state = ensureState(ctx);
  Object.keys(state).forEach(id => {
    const cfg = state[id];
    if (!cfg?.enabled || cfg.mode === 'none') return;
    const entry = getEntry(ctx, id);
    if (!entry?.light) return;
    const base = normCenter(cfg.center, entry.config?.position || { x: 0, y: 0, z: 0 });
    const speed = cfg.speed ?? 0.6;
    const phase = cfg.phase ?? 0;
    const amp = cfg.amplitude ?? 1;
    const osc = evalWaveform(cfg.waveform || 'sine', time * speed + phase);
    let nextPos = { ...entry.config.position };

    if (cfg.mode === 'orbit') {
      nextPos.x = base.x + Math.cos(time * speed + phase) * amp;
      nextPos.z = base.z + Math.sin(time * speed + phase) * amp;
      nextPos.y = base.y;
    } else if (cfg.mode === 'wave-x') {
      nextPos.x = base.x + osc * amp;
      nextPos.y = base.y;
      nextPos.z = base.z;
    } else if (cfg.mode === 'wave-y') {
      nextPos.y = base.y + osc * amp;
      nextPos.x = base.x;
      nextPos.z = base.z;
    } else if (cfg.mode === 'wave-z') {
      nextPos.z = base.z + osc * amp;
      nextPos.x = base.x;
      nextPos.y = base.y;
    } else {
      return;
    }

    entry.config.position = nextPos;
    entry.light.position.set(nextPos.x, nextPos.y, nextPos.z);
    entry.helper?.update?.();
  });
}
