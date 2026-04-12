import { SurfacePolicy, VisualDirectives } from './semanticTypography';

export interface TroikaPhysicalProperties {
  fontSize: number;
  fillOpacity: number;
  outlineWidth: number;
  renderOrder: number;
  layer: number; // 0 (Base/Bloom) ou 1 (Overlay)
  isHUD: boolean; // true = attaché à la caméra, false = dans la scène
}

// Couches WebGL canoniques
const ORB_BASE_RENDER_LAYER = 0;
const ORB_OVERLAY_RENDER_LAYER = 1;

/**
 * Traduit les directives visuelles abstraites en propriétés physiques pour Troika-Three-Text
 */
export function mapDirectivesToTroika(
  directives: VisualDirectives,
  surface: SurfacePolicy,
  isGlowProxy: boolean = false,
): TroikaPhysicalProperties {
  // 1. Résolution de la taille (Espace 3D)
  let fontSize = 0.1;
  switch (directives.size) {
    case 'xl':
      fontSize = 0.6;
      break;
    case 'lg':
      fontSize = 0.42;
      break; // Ex: Quote
    case 'md':
      fontSize = 0.15;
      break; // Ex: Chapter
    case 'sm':
      fontSize = 0.115;
      break; // Ex: Explanation
    case 'xs':
      fontSize = 0.09;
      break; // Ex: Author
  }

  // 2. Résolution du contraste (Opacité et Contour)
  let fillOpacity = 1.0;
  let outlineWidth = 0.002;

  if (isGlowProxy) {
    // Le mesh destiné au Bloom est toujours peu opaque et plus épais
    fillOpacity = 0.18;
    outlineWidth = directives.size === 'lg' ? 0.015 : 0.008;
  } else {
    // Le mesh de lecture (Overlay)
    switch (directives.contrast) {
      case 'absolute':
        fillOpacity = 1.0;
        outlineWidth = 0.01;
        break;
      case 'high':
        fillOpacity = 0.98;
        outlineWidth = 0.006;
        break;
      case 'medium':
        fillOpacity = 0.92;
        outlineWidth = 0.004;
        break;
      case 'low':
        fillOpacity = 0.85;
        outlineWidth = 0.002;
        break;
      case 'lowest':
        fillOpacity = 0.6;
        outlineWidth = 0.001;
        break;
    }
  }

  // 3. Résolution de la Surface (Ancrage)
  const isHUD = surface === '3d_hud' || surface === 'hybrid';

  // 4. Résolution des couches et du Z-Index (RenderOrder)
  const layer = isGlowProxy ? ORB_BASE_RENDER_LAYER : ORB_OVERLAY_RENDER_LAYER;

  // HUD passe au-dessus du World. Overlay passe au-dessus du Bloom.
  let renderOrder = isGlowProxy ? 3 : 20;
  if (isHUD && !isGlowProxy) renderOrder += 5; // HUD Lisible = 25+
  if (directives.size === 'lg' && !isGlowProxy) renderOrder += 1; // Priorité au texte géant

  return {
    fontSize,
    fillOpacity,
    outlineWidth,
    renderOrder,
    layer,
    isHUD,
  };
}
