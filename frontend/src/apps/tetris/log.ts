import { Logger } from '@dy-apps/services';

/**
 * The app's debug log, tagged `[tetris]`: game lifecycle, line clears and settlements, gifts and
 * the DyHub connection. Never per tick or per frame.
 */
export const log = new Logger('tetris');
