export const TABLE_WIDTH = 800;
export const TABLE_HEIGHT = 400;
export const BALL_RADIUS = 10;
export const POCKET_RADIUS = 22;
export const FRICTION = 0.98; // Increased friction for faster stopping
export const WALL_BOUNCE = 0.6; // More energy loss on walls
export const BALL_BOUNCE = 0.92; // More energy loss on ball collisions
export const MIN_VELOCITY = 0.15; // Higher threshold for stopping

export const COLORS = {
  TABLE_BED: '#1a75ff', // Blue as in the image
  TABLE_RAIL: '#8b0000', // Dark red/brown rails
  POCKET: '#000000',
  CUE_BALL: '#ffffff',
  BALLS: [
    '#ffcc00', // 1
    '#0033cc', // 2
    '#cc0000', // 3
    '#660099', // 4
    '#ff6600', // 5
    '#006600', // 6
    '#990000', // 7
    '#000000', // 8
    '#ffcc00', // 9 (striped)
    '#0033cc', // 10 (striped)
    '#cc0000', // 11 (striped)
    '#660099', // 12 (striped)
    '#ff6600', // 13 (striped)
    '#006600', // 14 (striped)
    '#990000', // 15 (striped)
  ]
};
