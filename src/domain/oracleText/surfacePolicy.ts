import {
  SemanticOracleDocument,
  TextBlock,
} from '../../scene/contracts/semanticTypography';

export interface SurfaceDistribution {
  htmlOverlay: Record<string, TextBlock>;
  htmlDrawer: Record<string, TextBlock>;
  webglWorld: Record<string, TextBlock>;
  webglHud: Record<string, TextBlock>;
  hidden: Record<string, TextBlock>;
}

/**
 * PHASE 2 & 6 - ROUTEUR DE SURFACES HYBRIDES & MOBILE-FIRST
 * Applique la doctrine : "3D pour sentir. HTML pour comprendre. Citations pour croire."
 * Sur mobile : "HTML net pour la citation, 3D réduite pour éviter l'encombrement."
 */
export function distributeSurfaces(
  doc: SemanticOracleDocument | null,
  isMobile: boolean = false,
): SurfaceDistribution {
  const dist: SurfaceDistribution = {
    htmlOverlay: {},
    htmlDrawer: {},
    webglWorld: {},
    webglHud: {},
    hidden: {},
  };

  if (!doc) return dist;

  for (const [key, block] of Object.entries(doc)) {
    const typedBlock = block as TextBlock;
    let targetSurface = typedBlock.surfacePolicy;

    // --- PHASE 6 : DOWNGRADE STRATÉGIQUE MOBILE ---
    if (isMobile) {
      // Sur mobile, la citation héroïque (qui peut être longue) retourne en HTML pour une lisibilité absolue
      if (key === 'quote' && targetSurface === '3d_world') {
        targetSurface = 'html_overlay';
      }
      // On évite aussi que les injonctions ou opening_image se chevauchent sur petit écran
      if (
        (key === 'imperative' || key === 'opening_image') &&
        targetSurface === '3d_hud'
      ) {
        targetSurface = 'html_overlay';
      }
      // Note : les 'keywords' et le 'chapter' restent en 3D (petits mots, très impactants)
    }

    switch (targetSurface) {
      case 'html_overlay':
        dist.htmlOverlay[key] = typedBlock;
        break;
      case 'html_drawer':
        dist.htmlDrawer[key] = typedBlock;
        break;
      case '3d_world':
        dist.webglWorld[key] = typedBlock;
        break;
      case '3d_hud':
        dist.webglHud[key] = typedBlock;
        break;
      case 'hybrid':
        dist.htmlOverlay[key] = typedBlock;
        dist.webglHud[key] = typedBlock;
        break;
      case 'hidden':
        dist.hidden[key] = typedBlock;
        break;
    }
  }

  return dist;
}
