import { Logger } from '@dy-apps/services';

/**
 * The app's debug log, tagged `[tetris]`: game lifecycle, line clears and settlements, gifts,
 * viewers' chat the game took, the like meter, votes and the room-feed connection. Never per tick
 * or per frame.
 */
export const log = new Logger('tetris');
