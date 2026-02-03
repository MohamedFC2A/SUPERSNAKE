/**
 * Game configuration constants
 */
export const Config = {
    // Game World
    WORLD_WIDTH: 4000,
    WORLD_HEIGHT: 4000,

    // Performance
    TARGET_FPS: 60,
    FIXED_TIMESTEP: 1000 / 60,

    // Snake
    SNAKE_INITIAL_LENGTH: 10,
    SNAKE_SEGMENT_SIZE: 12,
    SNAKE_SEGMENT_SPACING: 8,
    // Speeds are now in pixels/second (assuming 60fps previously: 3 * 60 = 180)
    SNAKE_BASE_SPEED: 180,
    // Clamp the "normal" movement speed so the snake stays moderate across sizes.
    SNAKE_MIN_MOVE_SPEED: 140,
    SNAKE_MAX_MOVE_SPEED: 180,
    SNAKE_BOOST_SPEED: 300,
    // Turn rate in radians/second (0.15 * 60 = 9)
    SNAKE_MAX_TURN_RATE: 9,
    // Boost
    BOOST_MAX_ENERGY: 220,
    BOOST_REGEN_PER_SEC: 18,
    // Boost cost per second (0.5 * 60 = 30)
    SNAKE_BOOST_COST: 30,

    // Food
    FOOD_COUNT: 500,
    FOOD_SIZE_MIN: 4,
    FOOD_SIZE_MAX: 8,
    FOOD_VALUE_NORMAL: 1,
    FOOD_VALUE_RARE: 5,
    FOOD_VALUE_POWER: 10,
    FOOD_SPAWN_RATE: 5,

    // Bots
    BOT_COUNT: 15,
    BOT_MIN_SIZE: 8,
    BOT_MAX_SIZE: 50,
    BOT_RESPAWN_DELAY: 3000,

    // Collision
    GRID_CELL_SIZE: 100,

    // Camera
    CAMERA_ZOOM_MIN: 0.5,
    CAMERA_ZOOM_MAX: 1.5,
    CAMERA_LERP_SPEED: 0.1,

    // Speed Boost
    SPEED_BOOST_DURATION: 10, // seconds
    SPEED_BOOST_MULTIPLIER: 1.6, // +60% speed

    // Colors
    COLORS: {
        NEON_CYAN: '#00f0ff',
        NEON_MAGENTA: '#ff00ff',
        NEON_PURPLE: '#8000ff',
        NEON_GREEN: '#00ff88',
        NEON_ORANGE: '#ff6600',
        NEON_PINK: '#ff0099',
        BACKGROUND: '#000000',
        GRID_LINE: 'rgba(255, 255, 255, 0.035)',
        BOSS_RED: '#ff0000',
        BOSS_EYE: '#ffcc00',
    },

    // Boss
    // Boss #1: FATE
    BOSS_FATE_SCORE_THRESHOLD: 100,
    BOSS_FATE_LIFETIME_SECONDS: 100,
    BOSS_FATE_SAFE_DISTANCE: 1000, // Distance from player when spawning
    BOSS_FATE_HEAD_RADIUS: 70, // much bigger + scarier
    BOSS_FATE_SEGMENT_RADIUS: 54,
    BOSS_FATE_LENGTH: 85, // very long
    BOSS_FATE_SEGMENT_SPACING: 18,
    BOSS_FATE_SPEED: 34, // slightly faster so it feels active
    BOSS_FATE_TURN_RATE: 0.75, // slower steering (still smart via prediction)

    // Boss #2: NONO (fast + small + food-eater)
    BOSS_NONO_SCORE_THRESHOLD: 200,
    BOSS_NONO_LIFETIME_SECONDS: 70,
    BOSS_NONO_SAFE_DISTANCE: 720,
    BOSS_NONO_HEAD_RADIUS: 36,
    BOSS_NONO_SEGMENT_RADIUS: 26,
    BOSS_NONO_LENGTH: 48,
    BOSS_NONO_SEGMENT_SPACING: 14,
    BOSS_NONO_SPEED: 96,
    BOSS_NONO_TURN_RATE: 2.2,

    // Boss drop (speed boost pickup)
    BOSS_DROP_RADIUS: 12, // small collectible
    BOSS_DROP_BOOST_DURATION: 8, // seconds
    BOSS_DROP_BOOST_MULTIPLIER: 2.4, // very fast

    // Bot AI Levels (based on score / food eaten)
    BOT_AI_LEVEL2_SCORE: 60,
    BOT_AI_LEVEL3_SCORE: 160,
    BOT_AI_THREAT_RADIUS_L1: 380,
    BOT_AI_THREAT_RADIUS_L2: 520,
    BOT_AI_THREAT_RADIUS_L3: 700,
    BOT_AI_LOOKAHEAD_L2: 190,
    BOT_AI_LOOKAHEAD_L3: 360,
    BOT_AI_SAFETY_BUFFER_L2: 10,
    BOT_AI_SAFETY_BUFFER_L3: 22,
    BOT_AI_DECISION_MS_L1: 350,
    BOT_AI_DECISION_MS_L2: 170,
    BOT_AI_DECISION_MS_L3: 90,

    // Snake Color Palettes
    SNAKE_PALETTES: [
        { primary: '#00f0ff', secondary: '#0088aa' },   // Cyan
        { primary: '#ff00ff', secondary: '#aa0088' },   // Magenta
        { primary: '#00ff88', secondary: '#00aa55' },   // Green
        { primary: '#ff6600', secondary: '#aa4400' },   // Orange
        { primary: '#ff0099', secondary: '#aa0066' },   // Pink
        { primary: '#8000ff', secondary: '#5500aa' },   // Purple
        { primary: '#ffff00', secondary: '#aaaa00' },   // Yellow
        { primary: '#ff3333', secondary: '#aa2222' },   // Red
    ],
} as const;

export type SnakePalette = typeof Config.SNAKE_PALETTES[number];
