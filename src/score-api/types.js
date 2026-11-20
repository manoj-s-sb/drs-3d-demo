// Types for the score/snapshot API (JSDoc + status enum).

export const REQUEST_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
};

/**
 * @typedef {Object} Batter
 * @property {string} name
 * @property {number} runs
 * @property {number} balls
 * @property {number} fours
 * @property {number} sixes
 * @property {number} sr
 */

/**
 * @typedef {Object} Bowler
 * @property {string} name
 * @property {string} overs
 * @property {number} runs
 * @property {number} wickets
 * @property {number} econ
 */

/**
 * @typedef {Object} Score
 * @property {string} match
 * @property {string} status
 * @property {number} inningsNumber
 * @property {number} maxOvers
 * @property {number|null} target
 * @property {string} battingTeam
 * @property {string} bowlingTeam
 * @property {number} runs
 * @property {number} wickets
 * @property {number} legalBalls
 * @property {string} overs
 * @property {Object} extras
 * @property {number} crr
 * @property {number|null} rrr
 * @property {Batter} striker
 * @property {Batter} nonStriker
 * @property {Bowler} bowler
 * @property {{runs:number}} partnership
 * @property {Object} reviews
 */

/**
 * GET /snapshot response.
 * @typedef {Object} Snapshot
 * @property {string} match
 * @property {number} innings
 * @property {number} over
 * @property {number} ball
 * @property {Score} score
 */

export {};
