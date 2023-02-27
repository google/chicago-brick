/*
 * `sliced_cubes` shows a field of rotating cubes breaking apart into tetrahedra
 * and octohedra, and then reforming as cubes.
 *
 * We witness a subset of an infinite array of cubes arranged in a checkerboard,
 * with one cube occupying every other monitor, breaking apart and reforming in
 * lockstep.  The bits of the cubes that slice off, fly to adjacent monitors,
 * then fly back to reform.
 *
 * Each cube consists of an internal tetrahedron formed by joining diagonal
 * pairs of cube vertices, plus the 4 corners sliced off the cube to find the
 * tetrahedron.  The tetrahedron in turn consists of 4 identical "wedges,"
 * smaller non-regular tetrahedra that each share a face with the larger
 * tetrahedron and peak at the center of the larger tetrahedron (also the center
 * of the cube).  Each corner also contains one of these tetra wedges, forming
 * the equilateral triangle base of the corner, plus 3 additional "corner
 * wedges."  We divide all of this into 4 identical sets of pieces, each
 * containing 2 tetra wedges and 1 corner piece consisting of the 3 corner
 * wedges.
 */

/**
 * The state of one set of pieces of the cube.
 *
 * Each set contains two tetrahedron wedges, which we call A and B, and a cube
 * corner piece we call C.  Each state property controls an aspect of one of
 * these pieces.  The property name begins with the piece name.
 *
 * We use the word "node" to mean a lattice point in the infinite checkerboard
 * the cubes inhabit.  It's also the center of a monitor.
 */
export declare interface PieceSetState {
  /**
   * "Corner-piece orientation."  0 means the corner is in cube orientation
   * (pointy part away from the center), 1 means it's in octohedron orientation
   * (pointy part at the center).  Between 0 and 1 means it's being rotated
   * between these orientations.
   */
  co: number;

  /**
   * "Corner-piece node."  0 means this corner is at the even-parity node it's
   * associated with, 3 means the odd-parity node, and between 0 and 3 means
   * it's moving between these two nodes.  1 is the point at which it detaches
   * from the first, and 2 is the point at which it attaches to the second.
   */
  cn: number;

  /**
   * "Tetra-wedge A corner orientation."  2 means wedge A is oriented and
   * attached to its corner piece, 0 means it is oriented and attached to its
   * node, and between 0 and 2 means it is rotating between them.  1 is the
   * point at which the attachment switches.
   */
  ac: number;

  /**
   * "Tetra-wedge A node."  Which of the two nodes wedge A is attached to.  Only
   * matters when ac is between 0 and 1.  0 means that A is attached to its
   * even-parity node, 1 means the odd-parity node.  This property is only ever
   * 0 or 1, nothing between.
   */
  an: number;

  /**
   * Like `ac`, but for wedge B.
   */
  bc: number;
  /**
   * Like `an`, but for wedge B.
   */
  bn: number;
}

/**
 * The state passed from server to clients, consisting of the states of all 4
 * sets of pieces of the cube.
 */
export type SlicedCubesState = [
  PieceSetState,
  PieceSetState,
  PieceSetState,
  PieceSetState,
];

/**
 * The stages that the module goes through.
 *
 * Stage 1: The pieces are arranged as a cube at node 0 (even-parity node).
 * Stage 2: Node 0 is a tetrahedron, node 1 is an octohedron.
 * Stage 3: Node 0 is an octohedron, node 1 is a tetrahedron.
 * Stage 4: Node 1 is a cube.
 */
export const STAGE1 = { co: 0, cn: 0, ac: 2, an: 0, bc: 0, bn: 0 };
export const STAGE2 = { co: 1, cn: 3, ac: 2, an: 1, bc: 0, bn: 0 };
export const STAGE3 = { co: 1, cn: 0, ac: 0, an: 1, bc: 2, bn: 0 };
export const STAGE4 = { co: 0, cn: 3, ac: 0, an: 1, bc: 2, bn: 1 };

/** What we call the state sent from server to clients. */
export const STATE_NAME = 'sliced_cubes';
