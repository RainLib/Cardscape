export interface Point2 {
  x: number;
  y: number;
}
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Placement extends Point2 {
  scale: number;
  rotation?: number;
}
