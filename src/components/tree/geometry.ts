// Row heights of the tree, shared by the rows that draw them and the page that joins their bark.

export const LANE = 52;
/** Days shown one branch per ride; older history folds into weeks. */
export const RECENT_DAYS = 5;
export const REST_STEP = 9;
export const WEEK_H = 48;
export const MONTH_H = 30;

export const dayHeight = (rides: number) => LANE * rides;
export const restHeight = (days: number) => 10 + days * REST_STEP;
