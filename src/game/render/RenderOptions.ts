export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface RenderOptions {
  quality: GraphicsQuality;
  glowEnabled: boolean;
}

