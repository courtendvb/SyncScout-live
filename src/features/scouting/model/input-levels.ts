export type InputLevel = 'basic' | 'tag' | 'court' | 'detailed';

/**
 * Input levels offered on the live header. SyncScout Live is used on phones
 * and tablets to feed SyncScout, where drawing directions on the court is too
 * slow for most scouts, so the button pads (Basic, Tags) are the default.
 * Direction input (drawing the ball on the court; its detail rows follow the
 * "simple input" setting) is an option in Settings.
 */
export function getAvailableInputLevels(directionInput: boolean): readonly InputLevel[] {
  return directionInput ? ['basic', 'tag', 'court'] : ['basic', 'tag'];
}

/**
 * Live input is only shown in landscape, on every device, so the court and
 * buttons always have the same layout (the court is always horizontal).
 * Holding the device upright shows "rotate your device" instead.
 */
export const LANDSCAPE_ONLY_INPUT = true;
