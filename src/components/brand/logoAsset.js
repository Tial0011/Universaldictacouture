import logoSrc from "../../assets/brand/logo.png";

/**
 * Single source of truth for the official logo artwork.
 *
 * To swap in a new master (e.g. an SVG from the designer):
 *   1. Drop the file into src/assets/brand/ and change the import above.
 *   2. Update width/height below to the new file's intrinsic size
 *      (for an SVG, its viewBox dimensions). Width/height are what
 *      reserve the space and prevent layout shift.
 * Nothing else needs to change — the logo is never drawn with HTML/CSS/text.
 */
export const LOGO = {
  src: logoSrc,
  width: 480,
  height: 244,
  alt: "Universal Dicta Couture",
};
