import { Client } from '../../client/modules/module_interface.ts';
import {
  CurrentValueInterpolator,
  ModuleState,
  NumberLerpInterpolator,
  SharedState,
} from '../../client/network/state_manager.ts';
import { Three, ThreeJsSurface } from '../../client/surface/threejs_surface.ts';
import { Polygon } from '../../lib/math/polygon2d.ts';
import { PieceSetState, SlicedCubesState, STATE_NAME } from './sliced_cubes.ts';

/**
 * Loads the SlicedCubes client.
 */
export function load(state: ModuleState, wallGeometry: Polygon) {
  class SlicedCubesClient extends Client {
    private sharedState!: SharedState;
    private slices!: CubeSlices;

    override willBeShownSoon(container: HTMLElement): Promise<void> {
      const surface = new ThreeJsSurface(container, wallGeometry, {
        antialias: true,
      });
      this.surface = surface;
      this.slices = new CubeSlices(surface);
      this.sharedState = state.define(STATE_NAME, [
        {
          co: NumberLerpInterpolator,
          cn: NumberLerpInterpolator,
          ac: NumberLerpInterpolator,
          an: CurrentValueInterpolator,
          bc: NumberLerpInterpolator,
          bn: CurrentValueInterpolator,
        },
      ]);
      return Promise.resolve();
    }

    override draw(time: number, _delta: number): void {
      const { sharedState, slices } = this;
      const x = ((2 * Math.PI) / 5000) * (time % 5000);
      const y = ((2 * Math.PI) / 6000) * (time % 6000);
      slices.setRotation(x, y);

      const state = sharedState.get(time) as SlicedCubesState;
      for (let index = 0; index < 4; ++index) {
        slices.applyState(state[index], index);
      }

      slices.surface.render();
    }

    override finishFadeOut(): void {
      if (this.surface) {
        this.surface.destroy();
      }
    }
  }

  return { client: SlicedCubesClient };
}

class CubeSlices {
  readonly grid: Grid;
  readonly sets: PieceSets;
  readonly node: Three.Object3D;
  readonly neighbors: Three.Object3D[];
  readonly rotators: Three.Object3D[] = [];
  readonly ships: ShipObject[];

  constructor(readonly surface: ThreeJsSurface) {
    surface.camera.position.z = 20;
    const grid = (this.grid = establishGrid(surface));
    this.sets = makeSets(grid);

    surface.scene.add(new Three.AmbientLight(0x808080));
    surface.renderer.setClearColor(0xdddddd, 1);

    const light1 = new Three.DirectionalLight(0xeeffee);
    light1.position.set(-20, +20, 4);
    surface.scene.add(light1);
    const light2 = new Three.DirectionalLight(0xffeeff);
    light2.position.set(+20, +20, 4);
    surface.scene.add(light2);

    const { rotators } = this;
    this.node = new Three.Object3D();
    this.node.position.copy(grid.centerPoint);
    rotators.push(this.node);

    this.neighbors = grid.neighborCenterPoints.map((pt) => {
      const node = new Three.Object3D();
      node.position.copy(pt);
      rotators.push(node);
      return node;
    });

    this.ships = this.neighbors.map((neighbor) => {
      const ship = new Three.Object3D() as ShipObject;
      ship.$neighbor = neighbor; // This ship shuttles between this.node and the given neighbor.
      rotators.push(ship);
      return ship;
    });

    if (grid.parity === 0) {
      for (const set of this.sets) {
        this.node.add(set.a);
        this.node.add(set.b);
        this.node.add(set.c);
      }
    } else {
      this.sets.forEach((set, index) => {
        this.neighbors[index].add(set.a);
        this.neighbors[index].add(set.b);
        this.neighbors[index].add(set.c);
      });
    }

    const scale = grid.diameter / 12; // 12 is the diameter of the octohedron
    for (const obj of this.rotators) {
      obj.scale.set(scale, scale, scale);
      surface.scene.add(obj);
    }
  }

  setRotation(x: number, y: number) {
    for (const obj of this.rotators) {
      obj.rotation.x = x;
      obj.rotation.y = y;
    }
  }

  applyState(state: PieceSetState, index: number) {
    const set = this.sets[index];
    const neighbor = this.neighbors[index];
    const node0 = this.grid.parity === 0 ? this.node : neighbor;
    const node1 = this.grid.parity === 0 ? neighbor : this.node;
    const nodes = [node0, node1];
    const corner = set.c as CornerObject;

    orientTetraWedge(set.a as WrappedObject, nodes[state.an], state.ac, corner);
    orientTetraWedge(set.b as WrappedObject, nodes[state.bn], state.bc, corner);

    const pos = 3 * state.co;
    corner.$inner.position.set(pos, pos, pos);

    if (!corner.$axis) {
      corner.$axis = corner.$middle.position.clone().multiplyScalar(0.75);
    }
    const posFactor = 1 - 2 * state.co; // -1 in cube, +1 in octa

    if (state.cn <= 1) {
      if (corner.parent != node0 || !corner.$axis) {
        node0.attach(corner);
      }
      corner.position.copy(corner.$axis).multiplyScalar(state.cn * posFactor);
    } else if (state.cn >= 2) {
      if (corner.parent != node1 || !corner.$axis) {
        node1.attach(corner);
      }
      corner.position
        .copy(corner.$axis)
        .multiplyScalar((3 - state.cn) * posFactor);
    } else {
      const ship = this.ships[index];
      if (corner.parent != ship) {
        corner.$inner.updateMatrixWorld();
        ship.position.set(1, 1, 1).applyMatrix4(corner.$inner.matrixWorld);
        ship.attach(corner);
      }
      node0.updateMatrixWorld();
      node1.updateMatrixWorld();
      const pt0 = corner.$axis
        .clone()
        .multiplyScalar(posFactor * 0.75)
        .applyMatrix4(node0.matrixWorld);
      const pt1 = corner.$axis
        .clone()
        .multiplyScalar(posFactor)
        .applyMatrix4(node0.matrixWorld);
      const pt2 = corner.$axis
        .clone()
        .multiplyScalar(posFactor)
        .applyMatrix4(node1.matrixWorld);
      const pt3 = corner.$axis
        .clone()
        .multiplyScalar(posFactor * 0.75)
        .applyMatrix4(node1.matrixWorld);
      // Cubic interpolation: http://paulbourke.net/miscellaneous/interpolation/
      const mu = state.cn - 1;
      const a0 = pt3.clone().sub(pt2).sub(pt0).add(pt1);
      const a1 = pt0.clone().sub(pt1).sub(a0);
      const a2 = pt2.clone().sub(pt0);
      const a3 = pt1;
      a0.multiplyScalar(mu * mu * mu);
      a1.multiplyScalar(mu * mu);
      a2.multiplyScalar(mu);
      a0.add(a1).add(a2).add(a3);

      ship.updateMatrixWorld();
      const cornerPos = corner.position.clone().applyMatrix4(ship.matrixWorld);
      ship.position.add(a0.sub(cornerPos));
    }
  }
}

interface Grid {
  origin: Three.Vector3;
  dx: number;
  dy: number;
  row: number;
  col: number;
  diameter: number;
  parity: number;
  // This monitor's center point
  centerPoint: Three.Vector3;
  // And those of its neighbors.
  neighborCenterPoints: [
    Three.Vector3,
    Three.Vector3,
    Three.Vector3,
    Three.Vector3,
  ];
}

// Figures out the dimensions of the rectangular grid on which we will lay out
// our polyhedra, which corresponds to the centers of the monitors.  Also
// positions the camera such that the polyhedra take up most of each monitor.
function establishGrid(surface: ThreeJsSurface): Grid {
  // Looks at monitor (1, 1).
  const topLeftCamera = surface.camera.clone() as Three.PerspectiveCamera;
  const bounds = surface.virtualRect;
  topLeftCamera.setViewOffset(
    surface.wallRect.w,
    surface.wallRect.h,
    0,
    0,
    bounds.w,
    bounds.h,
  );
  topLeftCamera.updateMatrixWorld(true);
  const raycaster = new Three.Raycaster();

  raycaster.setFromCamera(new Three.Vector2(0, 0), topLeftCamera);
  const z0 = new Three.Plane(new Three.Vector3(0, 0, 1), 0);
  const origin = new Three.Vector3();
  raycaster.ray.intersectPlane(z0, origin);

  const numRows = Math.round(surface.wallRect.h / bounds.h);
  const numCols = Math.round(surface.wallRect.w / bounds.w);
  if (numRows < 2 || numCols < 2) {
    throw new Error(
      'sliced_cubes module requires at least 2 rows and 2 columns',
    );
  }

  // Calculate the dimensions of the checkerboard rectangles.
  const dx = (-2 * origin.x) / (numCols - 1);
  const dy = (2 * origin.y) / (numRows - 1);

  // Calculate the max diameter of one of these polyhedra.
  const diameter = Math.min(dx * 0.6, dy * 0.6);

  // Which row/column we are in, counting from 1 at the top/left.
  const row = 1 + Math.round(bounds.y / bounds.h);
  const col = 1 + Math.round(bounds.x / bounds.w);

  // Calculates the center point of the polyhedron on the monitor at the given
  // row and column, where row and col are 1 for the top-left monitor.
  function cp(row: number, col: number): Three.Vector3 {
    const answer = origin.clone();
    answer.x += (col - 1) * dx;
    answer.y -= (row - 1) * dy;
    return answer;
  }

  const parity = (row & 1) ^ (col & 1);
  const n = 1 - parity * 2; // Neighbor offset for centerPoints.

  return {
    origin,
    dx,
    dy,
    row,
    col,
    diameter,
    parity,
    centerPoint: cp(row, col),
    neighborCenterPoints: [
      cp(row, col - n),
      cp(row - n, col),
      cp(row, col + n),
      cp(row + n, col),
    ],
  };
}

// Constructs the sets appropriate for this location, and returns them in an
// array.
function makeSets(grid: Grid) {
  const cornerWedgeGeometry = makeCornerWedgeGeometry();
  const tetraWedgeGeometry = makeTetraWedgeGeometry();
  const cornerMaterial = new Three.MeshPhongMaterial({
    color: 0x777777,
    emissive: 0x333333,
    flatShading: true,
    side: Three.DoubleSide,
  });
  let tetraColors;
  const r = grid.row;
  const c = grid.col;
  if (grid.parity === 0) {
    const myColor = getTetraColor(r, c);
    tetraColors = [myColor, myColor, myColor, myColor];
  } else {
    tetraColors = [
      getTetraColor(r, c + 1),
      getTetraColor(r + 1, c),
      getTetraColor(r, c - 1),
      getTetraColor(r - 1, c),
    ];
  }
  const sets = tetraColors.map((color) => {
    const tetraMaterial = new Three.MeshPhongMaterial({
      color,
      specular: color,
      emissive: 0x333333,
      flatShading: true,
      shininess: 50,
      side: Three.DoubleSide,
    });
    return makeSet(
      cornerWedgeGeometry,
      cornerMaterial,
      tetraWedgeGeometry,
      tetraMaterial,
    );
  }) as PieceSets;

  return cubifySets(sets);
}

/*
 * A brief explanation of the geometries in play.  We build up the cube from a
 * central regular tetrahedron, plus four corner pieces.  The central
 * tetrahedron is itself built up from four identical pieces, which we refer to
 * as "tetra wedges."  The corner pieces are also built up from four pieces:
 * another tetra wedge, plus three identical "corner wedges."
 *
 * To keep all the coordinates integral, our cube is 6 units to a side.
 */
function makeCornerWedgeGeometry() {
  // prettier-ignore
  const vertices = [
    0, 0, 0,
    6, 0, 0,
    0, 6, 0,
    1, 1, 1,
  ];
  return makeTetrahedronGeometry(vertices);
}

function makeTetraWedgeGeometry() {
  // prettier-ignore
  const vertices = [
    1, 1, 1,
    6, 0, 0,
    0, 6, 0,
    0, 0, 6,
  ];
  return makeTetrahedronGeometry(vertices);
}

function makeTetrahedronGeometry(vertices: number[]): Three.BufferGeometry {
  const a = new Three.Vector3(vertices[0], vertices[1], vertices[2]);
  const b = new Three.Vector3(vertices[3], vertices[4], vertices[5]);
  const c = new Three.Vector3(vertices[6], vertices[7], vertices[8]);
  const d = new Three.Vector3(vertices[9], vertices[10], vertices[11]);
  const answer = new Three.BufferGeometry();
  // prettier-ignore
  answer.setFromPoints([
    a, b, c,
    a, c, d,
    a, d, b,
    d, c, b,
  ]);
  answer.computeVertexNormals();
  return answer;
}

function makeCornerPiece(
  cornerWedgeGeometry: Three.BufferGeometry,
  material: Three.Material,
): Three.Object3D {
  const group = new Three.Object3D();

  const cw1 = new Three.Mesh(cornerWedgeGeometry, material);
  group.add(cw1);

  const cw2 = new Three.Mesh(cornerWedgeGeometry, material);
  cw2.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  group.add(cw2);

  const cw3 = new Three.Mesh(cornerWedgeGeometry, material);
  cw3.rotation.set(0, Math.PI / 2, Math.PI / 2);
  group.add(cw3);

  return group;
}

/** We jam extra properties on some objects. */
type WrappedObject = Three.Object3D & {
  $inner: Three.Object3D;
  $middle: Three.Object3D;
};

type ShipObject = Three.Object3D & {
  $neighbor: Three.Object3D;
};

type CornerObject = WrappedObject & {
  $axis: Three.Vector3;
};

/**
 * One of the 4 sets of 3D objects that make up a cube.
 */
interface PieceSet {
  /** The corner piece. */
  c: Three.Object3D;

  /** Tetra wedge A. */
  a: Three.Object3D;

  /** Tetra wedge B. */
  b: Three.Object3D;
}

/**
 * The 4 sets of 3D objects that collectively make up a cube.
 */
type PieceSets = [PieceSet, PieceSet, PieceSet, PieceSet];

// Returns a struct containing the 3 pieces that make a set: a corner (property
// "c") and two tetra wedges (properties "a" and "b").
function makeSet(
  cornerWedgeGeometry: Three.BufferGeometry,
  cornerMaterial: Three.Material,
  tetraWedgeGeometry: Three.BufferGeometry,
  tetraMaterial: Three.Material,
): PieceSet {
  const corner = makeCornerPiece(cornerWedgeGeometry, cornerMaterial);
  const tw1 = new Three.Mesh(tetraWedgeGeometry, tetraMaterial);
  const tw2 = new Three.Mesh(tetraWedgeGeometry, tetraMaterial);
  return { c: corner, a: tw1, b: tw2 };
}

function wrapPiece(piece: Three.Object3D): WrappedObject {
  const middle = new Three.Object3D();
  middle.add(piece);
  const outer = new Three.Object3D() as WrappedObject;
  outer.add(middle);
  outer.$inner = piece;
  outer.$middle = middle;
  return outer;
}

// Wraps the pieces of 4 sets in two layers of Object3D each, positioned so that
// the outermost objects can be added to yet another object to form a cube.
function cubifySets(sets: PieceSets): PieceSets {
  for (const set of sets) {
    set.a = wrapPiece(set.a);
    set.b = wrapPiece(set.b);
    set.c = wrapPiece(set.c);
  }

  for (const piece of Object.values(sets[0])) {
    piece.$middle.position.set(-3, -3, -3);
  }

  for (const piece of Object.values(sets[1])) {
    piece.$middle.rotateX(Math.PI);
    piece.$middle.position.set(-3, +3, +3);
  }

  for (const piece of Object.values(sets[2])) {
    piece.$middle.rotateY(Math.PI);
    piece.$middle.position.set(+3, -3, +3);
  }

  for (const piece of Object.values(sets[3])) {
    piece.$middle.rotateZ(Math.PI);
    piece.$middle.position.set(+3, +3, -3);
  }

  return sets;
}

function getTetraColor(row: number, col: number): number {
  // Ensures odd-parity nodes are surrounded by 4 different colors.
  const index = (((3 * row + col + 1) >> 1) + 2) & 3;
  return [0x4285f4, 0xea4335, 0xfbbc05, 0x34a853][index];
}

const WEDGE_AXIS = new Three.Vector3(1, 0, -1).normalize();
const WEDGE_ANGLE = 2 * Math.atan(Math.SQRT1_2);

function orientTetraWedge(
  wedge: WrappedObject,
  node: Three.Object3D,
  cornerOrientation: number,
  corner: WrappedObject,
) {
  const innerWedge = wedge.$inner;
  const middleWedge = wedge.$middle;
  if (cornerOrientation < 1) {
    if (wedge.parent != node) {
      node.add(wedge);
    }
    if (innerWedge.parent !== middleWedge) {
      middleWedge.add(innerWedge);
    }
    innerWedge.quaternion.setFromAxisAngle(
      WEDGE_AXIS,
      WEDGE_ANGLE * (1 - cornerOrientation),
    );
    const pos = 2 + 4 * cornerOrientation; // 0: 2; 1: 6
    const ypos = 4 + 2 * cornerOrientation; // 0: 4; 1: 6
    innerWedge.position.set(pos, ypos, pos);
  } else {
    const innerCorner = corner.$inner;
    if (innerWedge.parent != innerCorner) {
      innerCorner.add(innerWedge);
      innerWedge.rotation.set(0, 0, 0);
    }
    const pos = 3 * (2 - cornerOrientation); // 1: 2; 2: 0
    innerWedge.position.set(pos, pos, pos);
  }
}
