export function initDefaultLights(ctx: any): void;

export function addLight(ctx: any, config?: any): any;
export function removeLight(ctx: any, id: string): boolean;

export function setLightConfig(ctx: any, id: string, patch?: any): any;
export function setLightAnchor(ctx: any, id: string, anchorId: string): boolean;

export function setLightHelperVisible(ctx: any, id: string, visible: boolean): boolean;
export function setAllLightHelpersVisible(ctx: any, visible: boolean): void;
export function setLightHelperColor(ctx: any, id: string, color: any): boolean;

export function getLightsSnapshot(ctx: any): any[];
export function getLightAnchors(): string[];

export function updateLightsForFrame(ctx: any, time?: number): void;

export const setLightChoreoConfig: any;
export const getLightChoreoConfig: any;
