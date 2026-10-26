import * as THREE from "three";
import {
  DAY,
  NIGHT,
  SUN_DIR,
  MOON_DIR,
  PATH,
  PATH_LENGTH,
  pathFrame,
} from "../config.js";
import {
  createCloudTexture,
  createGlowTexture,
  createSignTexture,
  lerp,
  makeTube,
  rand,
} from "../lib/utils.js";

const deckWood = new THREE.MeshStandardMaterial({ color: 0x3a2a21, roughness: 0.94, metalness: 0 });
const sideWood = new THREE.MeshStandardMaterial({
  color: 0x2f221c,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide,
});
const railWood = new THREE.MeshStandardMaterial({ color: 0x634332, roughness: 0.82, metalness: 0.02 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2f2f, roughness: 0.6, metalness: 0.45 });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x52655f, roughness: 0.98, metalness: 0.02, flatShading: true });
const rockLightMat = new THREE.MeshStandardMaterial({ color: 0x7c8172, roughness: 0.95, flatShading: true });
const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });
const whitePaint = new THREE.MeshStandardMaterial({ color: 0xeee4d2, roughness: 0.7, metalness: 0.02 });
const redPaint = new THREE.MeshStandardMaterial({ color: 0xb44730, roughness: 0.68, metalness: 0.03 });
const darkGlass = new THREE.MeshStandardMaterial({
  color: 0x2f695f,
  roughness: 0.18,
  metalness: 0.25,
  emissive: 0x1a3d36,
  emissiveIntensity: 0.35,
});

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rnd = seeded(8117);

function buildRibbon(curve, segments, offsetA, yA, offsetB, yB) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const f = pathFrame(t);
    const a = f.position.clone().addScaledVector(f.right, offsetA);
    const b = f.position.clone().addScaledVector(f.right, offsetB);
    a.y += yA;
    b.y += yB;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uvs.push(0, t * 8, 1, t * 8);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeInstancedPilings(group) {
  const count = Math.max(10, Math.floor(PATH_LENGTH / 4.4));
  const geometry = new THREE.CylinderGeometry(0.11, 0.16, 1, 6);
  const mesh = new THREE.InstancedMesh(geometry, ironMat, count * 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let idx = 0;

  for (let i = 0; i < count; i++) {
    const f = pathFrame((i + 0.35) / count);
    for (const side of [-1, 1]) {
      const top = f.position.y - 0.46;
      const bottom = -1.4;
      p.copy(f.position).addScaledVector(f.right, side * 1.94);
      p.y = (top + bottom) * 0.5;
      s.set(1, top - bottom, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(idx++, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function makeDeck(group) {
  const segments = 460;
  const top = new THREE.Mesh(buildRibbon(PATH, segments, -2.28, -0.1, 2.28, -0.1), deckWood);
  top.receiveShadow = true;
  top.castShadow = false;
  group.add(top);

  const left = new THREE.Mesh(buildRibbon(PATH, segments, -2.28, -0.1, -2.28, -0.68), sideWood);
  const right = new THREE.Mesh(buildRibbon(PATH, segments, 2.28, -0.1, 2.28, -0.68), sideWood);
  left.castShadow = true;
  right.castShadow = true;
  left.receiveShadow = true;
  right.receiveShadow = true;
  group.add(left, right);

  // Planks
  const count = Math.floor(PATH_LENGTH / 0.74);
  const plankGeo = new THREE.BoxGeometry(1, 1, 1);
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  const planks = new THREE.InstancedMesh(plankGeo, plankMat, count);
  plankMat.roughness = 0.93;
  planks.castShadow = true;
  planks.receiveShadow = true;
  planks.name = "causeway-planks";

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const s = new THREE.Vector3(4.56, 0.115, 0.59);
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const f = pathFrame(t);
    basis.makeBasis(f.right, up, f.tangent);
    q.setFromRotationMatrix(basis);
    p.copy(f.position);
    p.y -= 0.06;
    m.compose(p, q, s);
    planks.setMatrixAt(i, m);
    const l = 0.185 + rnd() * 0.075;
    color.setHSL(0.066 + rnd() * 0.018, 0.34 + rnd() * 0.12, l);
    planks.setColorAt(i, color);
  }
  planks.instanceMatrix.needsUpdate = true;
  planks.instanceColor.needsUpdate = true;
  planks.computeBoundingSphere();
  group.add(planks);

  makeInstancedPilings(group);

  // Side beams under the deck
  const beamPointsL = [];
  const beamPointsR = [];
  for (let i = 0; i <= 80; i++) {
    const f = pathFrame(i / 80);
    const pl = f.position.clone().addScaledVector(f.right, -2.24);
    const pr = f.position.clone().addScaledVector(f.right, 2.24);
    pl.y -= 0.55;
    pr.y -= 0.55;
    beamPointsL.push(pl);
    beamPointsR.push(pr);
  }
  group.add(makeTube(beamPointsL, 0.12, railWood, { tubular: 220, radial: 5, closed: true }));
  group.add(makeTube(beamPointsR, 0.12, railWood, { tubular: 220, radial: 5, closed: true }));
}

function makeRailings(group) {
  const postCount = Math.floor(PATH_LENGTH / 2.5);
  const postGeo = new THREE.BoxGeometry(0.09, 1.1, 0.09);
  const posts = new THREE.InstancedMesh(postGeo, railWood, postCount * 2);
  posts.castShadow = true;
  posts.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();

  let idx = 0;
  for (let i = 0; i < postCount; i++) {
    const f = pathFrame(i / postCount);
    basis.makeBasis(f.right, up, f.tangent);
    q.setFromRotationMatrix(basis);
    for (const side of [-1, 1]) {
      p.copy(f.position).addScaledVector(f.right, side * 2.2);
      p.y += 0.55;
      m.compose(p, q, one);
      posts.setMatrixAt(idx++, m);
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  for (const side of [-1, 1]) {
    const topPoints = [];
    const midPoints = [];
    for (let i = 0; i <= 90; i++) {
      const f = pathFrame(i / 90);
      const pt = f.position.clone().addScaledVector(f.right, side * 2.2);
      const pm = pt.clone();
      pt.y += 1.1;
      pm.y += 0.58;
      topPoints.push(pt);
      midPoints.push(pm);
    }
    group.add(makeTube(topPoints, 0.038, railWood, { tubular: 260, radial: 5, closed: true }));
    group.add(makeTube(midPoints, 0.025, railWood, { tubular: 240, radial: 4, closed: true }));
  }
}

function makeStringLights(group) {
  const wirePoints = [];
  const bulbPositions = [];
  const count = 150;
  for (let i = 0; i < count; i++) {
    const f = pathFrame(i / count);
    const p = f.position.clone().addScaledVector(f.right, 2.38);
    p.y += 1.02 + Math.sin((i / count) * Math.PI * 40) * 0.015;
    wirePoints.push(p);
  }

  const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
  const wire = new THREE.LineLoop(
    wireGeo,
    new THREE.LineBasicMaterial({ color: 0x1c2422, transparent: true, opacity: 0.65 }),
  );
  group.add(wire);

  const bulbGeo = new THREE.SphereGeometry(0.045, 7, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a2, transparent: true, opacity: 0.42 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < count; i++) {
    m.compose(wirePoints[i], q, one);
    bulbs.setMatrixAt(i, m);
    bulbPositions.push(wirePoints[i]);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  bulbs.computeBoundingSphere();
  group.add(bulbs);

  // A few lantern posts around the loop
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffc989,
    emissive: 0xffa354,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    transparent: true,
    opacity: 0.92,
  });
  const lanterns = [];
  const postGeo = new THREE.CylinderGeometry(0.045, 0.06, 1.7, 6);
  const capGeo = new THREE.ConeGeometry(0.15, 0.12, 4);
  const cageGeo = new THREE.BoxGeometry(0.18, 0.23, 0.18);
  for (let i = 0; i < 10; i++) {
    const f = pathFrame((i / 10 + 0.015) % 1);
    const base = f.position.clone().addScaledVector(f.right, 2.12);
    base.y += 0.02;
    const post = new THREE.Mesh(postGeo, ironMat);
    post.position.copy(base).add(new THREE.Vector3(0, 0.85, 0));
    post.castShadow = true;
    group.add(post);
    const cage = new THREE.Mesh(cageGeo, lanternMat);
    cage.position.copy(base).add(new THREE.Vector3(0, 1.82, 0));
    group.add(cage);
    const cap = new THREE.Mesh(capGeo, ironMat);
    cap.position.copy(base).add(new THREE.Vector3(0, 2.0, 0));
    cap.rotation.y = Math.PI / 4;
    group.add(cap);
    lanterns.push(cage);
  }

  return { bulbMat, lanternMat, bulbPositions };
}

function makeSign(group) {
  const f = pathFrame(0.055);
  const base = f.position.clone().addScaledVector(f.right, 2.8);
  base.y += 0.1;
  const sign = new THREE.Group();
  sign.position.copy(base);

  const boardTexture = createSignTexture();
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.8, side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.82, 0.08), boardMat);
  board.position.y = 2.25;
  board.castShadow = true;
  sign.add(board);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(2.72, 0.94, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x473429, roughness: 0.9 }),
  );
  back.position.set(0, 2.25, -0.06);
  sign.add(back);

  for (const x of [-0.92, 0.92]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.7, 6), railWood);
    pole.position.set(x, 1.35, 0);
    pole.castShadow = true;
    sign.add(pole);
  }

  const arrowGeo = new THREE.ConeGeometry(0.12, 0.4, 3);
  const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshStandardMaterial({ color: 0xd46943, roughness: 0.6 }));
  arrow.position.set(0, 1.64, 0.02);
  arrow.rotation.z = Math.PI;
  sign.add(arrow);

  sign.lookAt(f.position.clone().setY(base.y + 1.4));
  group.add(sign);
}

function makeRock(scale, material = rockMat, seed = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const d =
      1 +
      0.16 * Math.sin(v.x * 5.3 + seed) +
      0.1 * Math.cos(v.y * 7.1 + seed * 2.1) +
      0.07 * Math.sin(v.z * 11.4 + v.x * 3.0);
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.copy(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeSandShelf(inner, outer, segments, rings) {
  const positions = [];
  const colors = [];
  const indices = [];
  const centerColor = new THREE.Color(0xd8bd94);
  const edgeColor = new THREE.Color(0xa18260);
  const c = new THREE.Color();

  for (let r = 0; r <= rings; r++) {
    const rt = r / rings;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const edgeWobble = 1 + (Math.sin(a * 5 + 1.4) * 0.038 + Math.sin(a * 11 - 0.6) * 0.017) * rt;
      const radius = lerp(inner, outer, rt) * edgeWobble;
      const y = 0.12 + Math.sin(a * 7.0 + rt * 2.0) * 0.025 * rt + (1 - rt) * 0.02;
      positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius * 0.96);
      c.copy(centerColor).lerp(edgeColor, Math.pow(rt, 0.65));
      colors.push(c.r, c.g, c.b);
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < segments; i++) {
      const a = r * (segments + 1) + i;
      const b = a + 1;
      const d = (r + 1) * (segments + 1) + i;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      emissive: 0x3e2917,
      emissiveIntensity: 0.26,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function makeIsland() {
  const island = new THREE.Group();

  // A pale, irregular sand shelf keeps the island from reading as a floating rock.
  const sand = makeSandShelf(8.6, 15.9, 88, 7);
  island.add(sand);

  const base = makeRock(new THREE.Vector3(11.7, 2.9, 10.0), rockMat, 2.3);
  base.position.y = -0.75;
  island.add(base);

  const shelf = makeRock(new THREE.Vector3(8.9, 1.15, 7.7), rockLightMat, 4.8);
  shelf.position.y = 0.2;
  island.add(shelf);

  // Lush dome
  const domeGeo = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = domeGeo.attributes.position;
  const colors = [];
  const c1 = new THREE.Color(0x4a6443);
  const c2 = new THREE.Color(0x7c8a58);
  const temp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const wobble = 1 + Math.sin(x * 7.1 + z * 4.3) * 0.018 + Math.cos(z * 9.2) * 0.012;
    pos.setX(i, x * wobble);
    pos.setZ(i, z * wobble);
    temp.copy(c1).lerp(c2, Math.max(0, y) * 0.8 + 0.1);
    colors.push(temp.r, temp.g, temp.b);
  }
  domeGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  domeGeo.computeVertexNormals();
  const dome = new THREE.Mesh(domeGeo, grassMat);
  dome.scale.set(8.5, 2.0, 7.5);
  dome.position.y = 2.52;
  dome.receiveShadow = true;
  dome.castShadow = true;
  island.add(dome);

  // Shore stones
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.2;
    const r = 8.5 + rnd() * 3.2;
    const stone = makeRock(
      new THREE.Vector3(0.5 + rnd() * 1.2, 0.4 + rnd() * 0.7, 0.6 + rnd() * 1.0),
      i % 3 === 0 ? rockLightMat : rockMat,
      i * 0.77,
    );
    stone.position.set(Math.cos(a) * r, 0.15 + rnd() * 0.35, Math.sin(a) * r * 0.9);
    stone.rotation.y = rnd() * Math.PI;
    island.add(stone);
  }

  return island;
}

function groundHeight(x, z) {
  const nx = x / 8.5;
  const nz = z / 7.5;
  const d = nx * nx + nz * nz;
  if (d >= 1) return 0;
  return 2.52 + 2.0 * Math.sqrt(1 - d);
}

function makeCypress(height, seed) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, height * 0.42, 6),
    new THREE.MeshStandardMaterial({ color: 0x4b3526, roughness: 0.95 }),
  );
  trunk.position.y = height * 0.21;
  trunk.castShadow = true;
  group.add(trunk);
  const mat = new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x2f4a38 : 0x3a573c, roughness: 1, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const radius = (1 - t) * height * 0.17 + 0.12;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 0.38, 7), mat);
    cone.position.y = height * (0.35 + t * 0.2);
    cone.castShadow = true;
    group.add(cone);
  }
  return group;
}

function makeOliveTree() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.9, 6), trunkMat);
  trunk.position.y = 0.95;
  trunk.rotation.z = 0.12;
  trunk.castShadow = true;
  group.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x55745a, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const s = 0.35 + rnd() * 0.38;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMat);
    blob.position.set(Math.cos(i * 2.4) * 0.8, 1.75 + Math.sin(i * 1.7) * 0.35, Math.sin(i * 2.4) * 0.8);
    blob.scale.y = 0.7;
    blob.castShadow = true;
    group.add(blob);
  }
  return group;
}

function makeLighthouse() {
  const group = new THREE.Group();
  const baseY = 4.36;
  group.position.y = baseY;

  // Stone plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.48, 28), rockLightMat);
  plinth.position.y = 0.12;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  const sections = [
    { y0: 0.36, y1: 1.45, r0: 1.42, r1: 1.36, mat: whitePaint },
    { y0: 1.45, y1: 2.05, r0: 1.36, r1: 1.3, mat: redPaint },
    { y0: 2.05, y1: 3.75, r0: 1.3, r1: 1.16, mat: whitePaint },
    { y0: 3.75, y1: 4.35, r0: 1.16, r1: 1.1, mat: redPaint },
    { y0: 4.35, y1: 6.5, r0: 1.1, r1: 0.92, mat: whitePaint },
  ];
  for (const s of sections) {
    const h = s.y1 - s.y0;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r1, s.r0, h, 28, 1), s.mat);
    mesh.position.y = s.y0 + h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.1, 0.16), darkGlass);
  door.position.set(0, 0.92, 1.35);
  group.add(door);
  const doorArch = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 14, 1, false, 0, Math.PI), darkGlass);
  doorArch.rotation.x = Math.PI / 2;
  doorArch.position.set(0, 1.47, 1.35);
  group.add(doorArch);

  // Windows
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x2b4b46,
    emissive: 0xffb266,
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });
  for (const [y, r] of [
    [2.8, 1.22],
    [5.3, 1.0],
  ]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.45, 0.12), windowMat);
    win.position.set(0, y, r);
    group.add(win);
  }

  // Gallery
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.2, 0.14, 32), ironMat);
  gallery.position.y = 6.56;
  gallery.castShadow = true;
  group.add(gallery);

  const railPosts = 20;
  for (let i = 0; i < railPosts; i++) {
    const a = (i / railPosts) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.65, 4), ironMat);
    post.position.set(Math.cos(a) * 1.24, 6.95, Math.sin(a) * 1.24);
    group.add(post);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.022, 5, 48), ironMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 7.27;
  group.add(rail);

  // Lantern room
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffd59a,
    emissive: 0xffa851,
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: 0.5,
    roughness: 0.15,
    metalness: 0.05,
  });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 1.25, 16, 1, true), glassMat);
  lantern.position.y = 7.22;
  group.add(lantern);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.26, 4), ironMat);
    bar.position.set(Math.cos(a) * 0.78, 7.22, Math.sin(a) * 0.78);
    group.add(bar);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.02, 1.2, 20), redPaint);
  roof.position.y = 8.46;
  roof.castShadow = true;
  group.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), ironMat);
  finial.position.y = 9.1;
  group.add(finial);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), ironMat);
  rod.position.y = 9.4;
  group.add(rod);

  const lampLight = new THREE.PointLight(0xffb15d, 0, 34, 2);
  lampLight.position.y = 7.25;
  group.add(lampLight);

  // Rotating beams
  const beamGroup = new THREE.Group();
  beamGroup.position.y = 7.25;
  group.add(beamGroup);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffdfa2,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const beamGeo = new THREE.CylinderGeometry(0.055, 5.8, 64, 22, 1, true);
  for (const rotation of [0, Math.PI]) {
    const pivot = new THREE.Group();
    pivot.rotation.y = rotation;
    const cone = new THREE.Mesh(beamGeo, beamMat);
    cone.rotation.z = Math.PI / 2;
    cone.position.x = 32;
    cone.frustumCulled = false;
    pivot.add(cone);
    beamGroup.add(pivot);
  }

  const spot = new THREE.SpotLight(0xffd195, 0, 110, 0.13, 0.75, 1.2);
  spot.position.set(0, 0, 0);
  spot.target.position.set(45, -1.5, 0);
  beamGroup.add(spot, spot.target);

  return {
    group,
    lampLight,
    beamGroup,
    beamMat,
    spot,
    windowMat,
    glassMat,
    baseY,
  };
}

function makeCottage() {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 2.1, 2.5),
    new THREE.MeshStandardMaterial({ color: 0xe5d2b4, roughness: 0.9 }),
  );
  wall.position.y = 1.05;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.35, 1.3, 4),
    new THREE.MeshStandardMaterial({ color: 0xa64832, roughness: 0.85 }),
  );
  roof.position.y = 2.7;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.82;
  roof.castShadow = true;
  group.add(roof);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.1, 0.36), rockLightMat);
  chimney.position.set(0.86, 3.12, -0.35);
  chimney.castShadow = true;
  group.add(chimney);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 1.05, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3c2d24, roughness: 0.8 }),
  );
  door.position.set(-0.7, 0.52, 1.26);
  group.add(door);

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffd18b,
    emissive: 0xff9f4f,
    emissiveIntensity: 0.4,
    roughness: 0.2,
  });
  for (const x of [0.55, 1.22]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), windowMat);
    win.position.set(x - 0.35, 1.22, 1.28);
    group.add(win);
  }

  const light = new THREE.PointLight(0xffa85c, 0, 9, 2);
  light.position.set(0.3, 1.5, 1.6);
  group.add(light);

  const smokeTexture = createCloudTexture();
  const smokeMat = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: 0xd8c8b2,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.position.set(0.86, 3.9, -0.35);
  smoke.scale.set(1.1, 1.1, 1);
  group.add(smoke);

  return { group, windowMat, light, smoke };
}

function makeTrees(island) {
  const positions = [
    [-4.7, -2.4, 3.0],
    [-5.4, 2.7, 2.4],
    [3.7, -4.4, 2.9],
    [6.4, -1.2, 2.1],
    [-2.2, 4.8, 2.3],
    [2.6, 4.9, 1.8],
  ];
  for (let i = 0; i < positions.length; i++) {
    const [x, z, h] = positions[i];
    const tree = makeCypress(h, i);
    tree.position.set(x, groundHeight(x, z) - 0.05, z);
    tree.rotation.y = rnd() * Math.PI;
    island.add(tree);
  }

  const olive = makeOliveTree();
  olive.position.set(-4.0, groundHeight(-4, 0.6) - 0.05, 0.6);
  olive.scale.setScalar(1.25);
  island.add(olive);

  // Grass blades
  const bladeGeo = new THREE.ConeGeometry(0.025, 0.34, 3);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x728a54, roughness: 1 });
  const count = 520;
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 7.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.88;
    p.set(x, groundHeight(x, z) - 0.03, z);
    e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI, (rnd() - 0.5) * 0.4);
    q.setFromEuler(e);
    s.set(0.8 + rnd() * 0.6, 0.6 + rnd() * 0.9, 0.8 + rnd() * 0.6);
    m.compose(p, q, s);
    blades.setMatrixAt(i, m);
  }
  blades.instanceMatrix.needsUpdate = true;
  blades.computeBoundingSphere();
  island.add(blades);

  // Flowers
  const flowerGeo = new THREE.IcosahedronGeometry(0.045, 0);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const flowerCount = 170;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
  const fc = new THREE.Color();
  for (let i = 0; i < flowerCount; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 2.2 + Math.sqrt(rnd()) * 5.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    p.set(x, groundHeight(x, z) + 0.12, z);
    m.compose(p, q.identity(), s.setScalar(0.7 + rnd() * 0.8));
    flowers.setMatrixAt(i, m);
    fc.setHex([0xf3e4c4, 0xe9a15e, 0xd96b46, 0xf0c86c][Math.floor(rnd() * 4)]);
    flowers.setColorAt(i, fc);
  }
  flowers.instanceMatrix.needsUpdate = true;
  flowers.instanceColor.needsUpdate = true;
  flowers.computeBoundingSphere();
  island.add(flowers);
}

function makeClouds(scene) {
  const group = new THREE.Group();
  const texture = createCloudTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffd7b2,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    fog: false,
  });
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 72 + rnd() * 85;
    const sprite = new THREE.Sprite(material);
    sprite.position.set(Math.cos(a) * r, 35 + rnd() * 38, Math.sin(a) * r);
    const w = 26 + rnd() * 32;
    sprite.scale.set(w, w * 0.32, 1);
    group.add(sprite);
  }
  scene.add(group);
  return { group, material };
}

function makeBirds(scene) {
  const material = new THREE.MeshBasicMaterial({ color: 0x203b3d, side: THREE.DoubleSide, fog: true });
  const birds = [];
  const root = new THREE.Group();
  scene.add(root);

  for (let i = 0; i < 14; i++) {
    const group = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, -0.15, 1.4, 0.02, 0.28, 0.12, 0, 0.4], 3),
    );
    wingGeo.computeVertexNormals();
    const left = new THREE.Mesh(wingGeo, material);
    left.scale.x = -1;
    const right = new THREE.Mesh(wingGeo, material);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 4), material);
    body.rotation.x = Math.PI / 2;
    group.add(left, right, body);
    const scale = 0.55 + rnd() * 0.9;
    group.scale.setScalar(scale);
    root.add(group);
    birds.push({
      group,
      left,
      right,
      radius: 28 + rnd() * 45,
      height: 18 + rnd() * 30,
      speed: (0.035 + rnd() * 0.04) * (rnd() > 0.5 ? 1 : -1),
      phase: rnd() * Math.PI * 2,
      flap: 5 + rnd() * 4,
    });
  }

  return { root, birds };
}

function makeDistantIslands(scene) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x31535a, roughness: 1, metalness: 0 });
  const matFar = new THREE.MeshStandardMaterial({ color: 0x476b6f, roughness: 1, metalness: 0 });
  const spots = [
    [150, 0.7, 26, 18, 22],
    [210, 2.1, 38, 25, 30],
    [175, 3.3, 20, 12, 16],
    [235, 4.5, 46, 30, 38],
    [190, 5.4, 24, 15, 21],
    [260, 6.1, 32, 20, 26],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [radius, a, sx, sy, sz] = spots[i];
    const island = makeRock(new THREE.Vector3(sx, sy, sz), i % 2 ? mat : matFar, i * 1.7);
    island.position.set(Math.cos(a) * radius, -6, Math.sin(a) * radius);
    island.rotation.y = rnd() * Math.PI;
    group.add(island);
  }

  scene.add(group);
  return group;
}

function makeBoat(scale = 1) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe9dfca, roughness: 0.65 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.6, 1.2), hullMat);
  hull.position.y = 0.2;
  hull.castShadow = true;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), hullMat);
  bow.rotation.z = -Math.PI / 2;
  bow.position.set(1.9, 0.23, 0);
  bow.rotation.y = Math.PI / 4;
  group.add(bow);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 4.2, 5), railWood);
  mast.position.y = 2.4;
  group.add(mast);

  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0.1, 4.2, 0, 0.1, 0.45, 0, 1.85, 0.5, 0], 3),
  );
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(
    sailGeo,
    new THREE.MeshStandardMaterial({ color: 0xf1e6d1, roughness: 0.9, side: THREE.DoubleSide }),
  );
  group.add(sail);
  group.scale.setScalar(scale);
  return group;
}

function makeBoats(scene) {
  const boats = [];
  const specs = [
    [105, 1.3, 1.5],
    [132, 3.8, 1.1],
    [88, 5.2, 0.9],
  ];
  for (const [radius, angle, scale] of specs) {
    const boat = makeBoat(scale);
    boat.position.set(Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius);
    boat.rotation.y = -angle + Math.PI / 2;
    scene.add(boat);
    boats.push({ boat, baseY: 0.1, phase: angle * 3 });
  }
  return boats;
}

function makeBuoys(scene) {
  const buoys = [];
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xb8402b, roughness: 0.5, metalness: 0.1 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffb26b,
    emissive: 0xff6e39,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), buoyMat);
    body.position.y = 0.25;
    body.scale.y = 1.25;
    group.add(body);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 5), ironMat);
    pole.position.y = 0.95;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lightMat);
    lamp.position.y = 1.53;
    group.add(lamp);
    const a = 0.7 + i * 1.7;
    const r = 34 + i * 4;
    group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(group);
    buoys.push({ group, lamp, phase: i * 1.7 });
  }
  return { buoys, lightMat };
}

function makeSunSprite(scene) {
  const texture = createGlowTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffd9a4,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(SUN_DIR).multiplyScalar(330);
  sprite.scale.setScalar(95);
  sprite.frustumCulled = false;
  sprite.renderOrder = -900;
  scene.add(sprite);
  return { sprite, material };
}

export function createWorld(scene, renderer) {
  const root = new THREE.Group();
  scene.add(root);

  scene.fog = new THREE.Fog(DAY.fog.clone(), 70, 340);

  const island = makeIsland();
  root.add(island);

  makeTrees(island);

  // Lighthouse island details
  const lighthouse = makeLighthouse();
  root.add(lighthouse.group);

  const cottage = makeCottage();
  const cx = 4.9;
  const cz = 2.3;
  cottage.group.position.set(cx, groundHeight(cx, cz) - 0.12, cz);
  cottage.group.rotation.y = -0.55;
  island.add(cottage.group);

  // A small stone path from cottage to lighthouse
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb1a58b, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = lerp(3.8, 1.3, t) + Math.sin(i * 2.2) * 0.22;
    const z = lerp(1.7, 0.35, t) + Math.cos(i * 1.6) * 0.24;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.08, 7), stoneMat);
    stone.position.set(x, groundHeight(x, z) + 0.02, z);
    stone.rotation.y = i;
    island.add(stone);
  }

  makeDeck(root);
  makeRailings(root);
  const stringLights = makeStringLights(root);
  makeSign(root);

  const clouds = makeClouds(scene);
  const birds = makeBirds(scene);
  makeDistantIslands(scene);
  const boats = makeBoats(scene);
  const buoys = makeBuoys(scene);
  const sunSprite = makeSunSprite(scene);

  // ── Lighting ──────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(DAY.hemiSky.clone(), DAY.hemiGround.clone(), 1.35);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(DAY.sunLight.clone(), 2.45);
  sun.position.copy(SUN_DIR).multiplyScalar(66);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(DAY.fillLight.clone(), 0.55);
  fill.position.set(45, 30, 30);
  scene.add(fill);

  const ambient = new THREE.AmbientLight(0x8caead, 0.18);
  scene.add(ambient);

  // Soft bounce from the water
  const bounce = new THREE.DirectionalLight(0x4d8d91, 0.24);
  bounce.position.set(-20, 8, 30);
  scene.add(bounce);

  const dayFog = DAY.fog.clone();
  const nightFog = NIGHT.fog.clone();
  const tmpColor = new THREE.Color();

  function update(dt, time, night) {
    const sunPos = SUN_DIR.clone().lerp(MOON_DIR, night).normalize().multiplyScalar(92);
    sun.position.copy(sunPos);
    sun.color.copy(DAY.sunLight).lerp(NIGHT.sunLight, night);
    sun.intensity = lerp(2.45, 0.48, night);

    hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, night);
    hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, night);
    hemi.intensity = lerp(1.15, 0.4, night);

    fill.color.copy(DAY.fillLight).lerp(NIGHT.fillLight, night);
    fill.intensity = lerp(0.48, 0.2, night);
    bounce.color.copy(DAY.fillLight).lerp(NIGHT.fillLight, night);
    bounce.intensity = lerp(0.24, 0.1, night);
    ambient.intensity = lerp(0.18, 0.09, night);

    scene.fog.color.copy(dayFog).lerp(nightFog, night);
    scene.fog.near = lerp(70, 44, night);
    scene.fog.far = lerp(340, 270, night);

    lighthouse.beamGroup.rotation.y = time * 0.28;
    lighthouse.beamMat.opacity = night * 0.1;
    lighthouse.lampLight.intensity = night * 48;
    lighthouse.spot.intensity = night * 280;
    lighthouse.glassMat.emissiveIntensity = lerp(0.75, 2.0, night);
    lighthouse.windowMat.emissiveIntensity = lerp(0.18, 1.15, night);

    cottage.light.intensity = night * 7;
    cottage.windowMat.emissiveIntensity = lerp(0.2, 1.25, night);
    cottage.smoke.material.opacity = 0.1 + night * 0.08;
    cottage.smoke.position.y = 3.8 + Math.sin(time * 0.4) * 0.12;
    cottage.smoke.material.rotation = Math.sin(time * 0.12) * 0.5;

    stringLights.bulbMat.opacity = lerp(0.3, 1, night);
    stringLights.bulbMat.color.copy(tmpColor.set(0xf1d5a2)).lerp(new THREE.Color(0xffc778), night);
    stringLights.lanternMat.emissiveIntensity = lerp(0.22, 1.4, night);

    sunSprite.material.color.copy(DAY.sunColor).lerp(NIGHT.sunColor, night);
    sunSprite.material.opacity = lerp(0.62, 0.36, night);
    sunSprite.sprite.position.copy(SUN_DIR).lerp(MOON_DIR, night).normalize().multiplyScalar(330);
    sunSprite.sprite.scale.setScalar(lerp(78, 18, night));

    clouds.material.opacity = lerp(0.22, 0.06, night);
    clouds.material.color.copy(DAY.cloudColor).lerp(NIGHT.cloudColor, night);
    clouds.group.rotation.y = time * 0.0016;

    for (const b of birds.birds) {
      const a = time * b.speed + b.phase;
      b.group.position.set(
        Math.cos(a) * b.radius + Math.sin(a * 2.1) * 2.2,
        b.height + Math.sin(time * 0.5 + b.phase) * 2.0,
        Math.sin(a) * b.radius * 0.85,
      );
      b.group.rotation.y = -a - Math.PI / 2;
      const flap = Math.sin(time * b.flap + b.phase) * 0.55;
      b.left.rotation.z = flap;
      b.right.rotation.z = -flap;
    }

    for (const b of boats) {
      b.boat.position.y = b.baseY + Math.sin(time * 0.55 + b.phase) * 0.095;
      b.boat.rotation.z = Math.sin(time * 0.4 + b.phase) * 0.02;
      b.boat.rotation.x = Math.sin(time * 0.32 + b.phase * 2) * 0.014;
    }

    for (const b of buoys.buoys) {
      b.group.position.y = Math.sin(time * 0.8 + b.phase) * 0.08;
      b.group.rotation.z = Math.sin(time * 0.6 + b.phase) * 0.08;
      b.group.rotation.x = Math.cos(time * 0.5 + b.phase) * 0.06;
      b.lamp.material.emissiveIntensity = 0.4 + Math.max(0, Math.sin(time * 2.2 + b.phase)) * (1.4 + night * 1.8);
    }

  }

  return {
    root,
    island,
    lighthouse,
    cottage,
    sun,
    hemi,
    fill,
    stringLights,
    update,
    groundHeight,
    boats,
    birds,
    clouds,
  };
}
