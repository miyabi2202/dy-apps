import { createConnectionStore } from '@dy-apps/services';

/** What the editor's form last held, valid or not, so a reload keeps the typing. */
export const connectionStore = createConnectionStore('danmaku');
