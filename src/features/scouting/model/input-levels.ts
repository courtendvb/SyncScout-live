/**
 * Input levels offered in the app. SyncScout Live is used on phones and
 * tablets to feed SyncScout, where drawing directions on the court is too
 * slow, so the court-drawing levels (Court, Detailed) are switched off: only
 * the button pads remain. The court input code is kept; set this to true to
 * offer it again.
 */
export const DIRECTION_INPUT_ENABLED = false;

export type InputLevel = 'basic' | 'tag' | 'court' | 'detailed';

export const AVAILABLE_INPUT_LEVELS: readonly InputLevel[] = DIRECTION_INPUT_ENABLED
  ? ['basic', 'tag', 'court', 'detailed']
  : ['basic', 'tag'];

/**
 * Live input is only shown in landscape, on every device, so the court and
 * buttons always have the same layout (the court is always horizontal).
 * Holding the device upright shows "rotate your device" instead.
 */
export const LANDSCAPE_ONLY_INPUT = true;
