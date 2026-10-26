import * as THREE from "three";

export const DAY = {
  skyTop: new THREE.Color(0x2a687d),
  skyMid: new THREE.Color(0xd97a72),
  skyHorizon: new THREE.Color(0xffa15c),
  sunColor: new THREE.Color(0xffd49d),
  cloudColor: new THREE.Color(0xffb58a),
  oceanDeep: new THREE.Color(0x032a35),
  oceanShallow: new THREE.Color(0x0e5c66),
  oceanHorizon: new THREE.Color(0xcf956e),
  foam: new THREE.Color(0xd9e6d7),
  fog: new THREE.Color(0xcf9f7b),
  sunLight: new THREE.Color(0xffc78f),
  fillLight: new THREE.Color(0x7fb5c4),
  hemiSky: new THREE.Color(0xb9d9d4),
  hemiGround: new THREE.Color(0x5a4030),
  exposure: 1.04,
};

export const NIGHT = {
  skyTop: new THREE.Color(0x020914),
  skyMid: new THREE.Color(0x101f33),
  skyHorizon: new THREE.Color(0x0a293b),
  sunColor: new THREE.Color(0xc7ddf7),
  cloudColor: new THREE.Color(0x3d5669),
  oceanDeep: new THREE.Color(0x010b12),
  oceanShallow: new THREE.Color(0x08232d),
  oceanHorizon: new THREE.Color(0x0b2a3c),
  foam: new THREE.Color(0x9ebcc1),
  fog: new THREE.Color(0x071927),
  sunLight: new THREE.Color(0x9fc5ec),
  fillLight: new THREE.Color(0x2b5878),
  hemiSky: new THREE.Color(0x244b65),
  hemiGround: new THREE.Color(0x0a1518),
  exposure: 0.82,
};

export const SUN_DIR = new THREE.Vector3(-0.6, 0.18, -0.78).normalize();
export const MOON_DIR = new THREE.Vector3(0.52, 0.48, -0.7).normalize();

export const PATH = (() => {
  const points = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rx = 24.5 + Math.sin(a * 3 + 0.4) * 2.0;
    const rz = 19.5 + Math.cos(a * 2 - 0.7) * 1.8;
    points.push(new THREE.Vector3(Math.cos(a) * rx, 2.55 + Math.sin(a * 3 + 1.1) * 0.08, Math.sin(a) * rz));
  }
  return new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.45);
})();

export const PATH_LENGTH = PATH.getLength();

export function pathFrame(t) {
  const tt = ((t % 1) + 1) % 1;
  const position = PATH.getPointAt(tt);
  const tangent = PATH.getTangentAt(tt).normalize();
  const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
  return { position, tangent, right, t: tt };
}
