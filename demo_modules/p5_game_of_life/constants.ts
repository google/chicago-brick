export const NUM_COLUMNS = 184;
export const NUM_ROWS = 40;

declare global {
  interface EmittedEvents {
    board(data: { board: Array<number[]> }): void;
  }
}
