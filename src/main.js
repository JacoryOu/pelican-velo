import "./styles.css";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

import { DAY, NIGHT, SUN_DIR, MOON_DIR, PATH_LENGTH, pathFrame } from "./config.js";
import { makeSky } from "./scene/sky.js";
import { makeOcean } from "./scene/ocean.js";
import { createWorld } from "./scene/world.js";
import { createBike } from "./scene/bike.js";
import { createPelican } from "./scene/pelican.js";
import { Soundscape } from "./audio.js";
import { clamp, damp, lerp, createEnvTexture } from "./lib/utils.js";

const app = document.getElementById("app");
const canvas = document.getElementById("scene");
const loaderLabel = document.getElementById("loader-label");
const loaderFill = document.getElementById("loader-fill");
const loaderPercent = document.getElementById("loader-percent");
const speedValue = document.getElementById("speed-value");
const distanceValue = document.getElementById("distance-value");
const lapValue = document.getElementById("lap-value");
const lapTimeEl = document.getElementById("lap-time");
const bestTimeEl = document.getElementById("best-time");
const lapProgress = document.getElementById("lap-progress");
const cadenceValue = document.getElementById("cadence-value");
const speedRange = document.getElementById("speed-range");
const cameraLabel = document.getElementById("camera-label");
const qualityLabel = document.getElementById("quality-label");
const weatherLabel = document.getElementById("weather-label");
const toastEl = document.getElementById("toast");
const soundBtn = document.querySelector('[data-action="sound"]');
const themeBtn = document.querySelector('[data-action="theme"]');
const themeLabel = themeBtn?.querySelector(".theme-btn__label");
const photoUI = document.getElementById("photo-ui");
const photoDate = document.getElementById("photo-date");
const flash = document.getElementById("flash");
const cursorEl = document.getElementById("cursor");
const notesEl = document.getElementById("notes");
const notesBackdrop = document.getElementById("notes-backdrop");
const drawcallsValue = document.getElementById("drawcalls-value");
const pauseBtn = document.querySelector('[data-action="pause"]');

const isMobile = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;
const nextFrame = () =>
  new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 140);
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

window.__pelicanErrors = [];
window.addEventListener("error", (event) => {
  window.__pelicanErrors.push(String(event.error?.stack || event.message || "error"));
});
window.addEventListener("unhandledrejection", (event) => {
  window.__pelicanErrors.push(String(event.reason?.stack || event.reason || "rejection"));
});

const state = {
  entered: false,
  paused: false,
  night: 0,
  nightTarget: 0,
  speed: 2.2,
  targetSpeed: 2.2,
  speedBeforePause: 3.2,
  speedBeforeBrake: 3.2,
  distance: 0,
  pathT: 0.12,
  rideClock: 0,
  lapStart: 0,
  lapCount: 1,
  lapArmed: false,
  bestLap: null,
  lean: 0,
  sceneTime: 0,
  introTransition: 1,
  cameraMode: "follow",
  freeYaw: 0,
  freePitch: 0.24,
  freeDist: 6.8,
  drawnOnce: false,
};

try {
  const stored = parseFloat(localStorage.getItem("pelican-best-lap") || "");
  if (Number.isFinite(stored) && stored > 0) state.bestLap = stored;
} catch {
  // localStorage may be unavailable in privacy mode.
}

let renderer;
let scene;
let camera;
let composer;
let bloomPass;
let gradePass;
let sky;
let ocean;
let world;
let bike;
let pelican;
let audio;
let raycaster;
let pointerNdc;
const camPos = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
let lastTime = 0;
let uiTimer = 0;
let fpsTimer = 0;
let fpsFrames = 0;
let pixelRatio = isMobile ? 1.25 : Math.min(window.devicePixelRatio || 1, 1.7);
let quality = isMobile ? "MOBILE" : "AUTO";
let bootStart = 0;
let drag = null;
let movedDistance = 0;
let toastTimer = 0;
let photoBusy = false;

const cameraModeNames = {
  follow: "FOLLOW",
  orbit: "ORBIT",
  hero: "HERO",
  free: "FREE",
};

const cameraToast = {
  follow: "镜头 · 跟随",
  orbit: "镜头 · 环游",
  hero: "镜头 · 英雄",
  free: "镜头 · 自由环视",
};

function setProgress(percent, label) {
  const p = clamp(percent, 0, 100);
  loaderFill.style.width = `${p}%`;
  loaderPercent.textContent = String(Math.round(p)).padStart(2, "0");
  if (label) loaderLabel.textContent = label;
}

function showFatal(error) {
  console.error(error);
  setProgress(100, "这个浏览器还没有准备好 WebGL");
  loaderPercent.textContent = "!!";
  loaderFill.style.background = "#df6b42";
  loaderLabel.textContent = "这个世界需要 WebGL 2。换一个更新的浏览器试试。";
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNight: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNight;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float dist = length(d);

      float ca = 0.00055 + uNight * 0.00035;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + d * ca).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - d * ca).b;

      // Gentle lens vignette
      float vig = smoothstep(1.1, 0.28, dist);
      color *= mix(1.0, vig, 0.28);

      // Warm highlights, cool shadows
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, 1.07);
      color = (color - 0.5) * 1.035 + 0.5;
      color = mix(color, color * vec3(0.94, 0.985, 1.045), (1.0 - luma) * 0.16);
      color = mix(color, color * vec3(1.035, 1.005, 0.965), luma * 0.14);

      // A whisper of grain
      float grain = hash(gl_FragCoord.xy * 0.9 + fract(uTime) * 100.0) - 0.5;
      color += grain * (0.018 + uNight * 0.008);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
    stencil: false,
  });
  if (!renderer.capabilities.isWebGL2) {
    throw new Error("WebGL2 is required");
  }
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAY.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 720);
  camera.position.set(24, 14, 26);
  camera.lookAt(0, 3, 0);
  raycaster = new THREE.Raycaster();
  pointerNdc = new THREE.Vector2();
}

function setupPost() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: isMobile ? 0 : 4,
    depthBuffer: true,
  });
  composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.33,
    0.65,
    0.84,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  gradePass = new ShaderPass(GradeShader);
  gradePass.renderToScreen = true;
  composer.addPass(gradePass);
}

function setupEnvironment() {
  const envTexture = createEnvTexture();
  envTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromEquirectangular(envTexture);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.5;
  envTexture.dispose();
  pmrem.dispose();
}

function placeBikeFrame(time = 0) {
  const f = pathFrame(state.pathT);
  const yaw = Math.atan2(-f.tangent.z, f.tangent.x);
  const bob = Math.sin(state.distance * 3.3) * 0.004;

  bike.group.position.copy(f.position);
  bike.group.position.y -= 0.01 + bob;
  bike.group.rotation.order = "YXZ";
  bike.group.rotation.y = yaw;
  bike.group.rotation.x = state.lean;
  bike.group.rotation.z = 0;
}

function applyPalette(night) {
  const s = sky.uniforms;
  s.uNight.value = night;
  s.uTop.value.copy(DAY.skyTop).lerp(NIGHT.skyTop, night);
  s.uMid.value.copy(DAY.skyMid).lerp(NIGHT.skyMid, night);
  s.uHorizon.value.copy(DAY.skyHorizon).lerp(NIGHT.skyHorizon, night);
  s.uSunColor.value.copy(DAY.sunColor).lerp(NIGHT.sunColor, night);
  s.uCloudColor.value.copy(DAY.cloudColor).lerp(NIGHT.cloudColor, night);
  s.uDeep.value.copy(DAY.oceanDeep).lerp(NIGHT.oceanDeep, night);

  const o = ocean.uniforms;
  o.uNight.value = night;
  o.uSunDir.value.copy(SUN_DIR).lerp(MOON_DIR, night).normalize();
  o.uSunColor.value.copy(DAY.sunColor).lerp(NIGHT.sunColor, night);
  o.uDeep.value.copy(DAY.oceanDeep).lerp(NIGHT.oceanDeep, night);
  o.uShallow.value.copy(DAY.oceanShallow).lerp(NIGHT.oceanShallow, night);
  o.uHorizon.value.copy(DAY.oceanHorizon).lerp(NIGHT.oceanHorizon, night);
  o.uFoam.value.copy(DAY.foam).lerp(NIGHT.foam, night);

  renderer.toneMappingExposure = lerp(DAY.exposure, NIGHT.exposure, night);
  scene.environmentIntensity = lerp(0.5, 0.2, night);

  bloomPass.strength = lerp(0.28, 0.6, night);
  bloomPass.threshold = lerp(0.86, 0.6, night);
  gradePass.uniforms.uNight.value = night;
}

function cinematicShot() {
  const pos = bike.group.position;
  const a = state.sceneTime * 0.085 + 0.55;
  const desired = new THREE.Vector3(
    pos.x + Math.cos(a) * 20.5,
    pos.y + 6.2 + Math.sin(state.sceneTime * 0.17) * 0.45,
    pos.z + Math.sin(a) * 21.5,
  );
  const look = pos.clone().add(new THREE.Vector3(0, 2.85, 0));
  return { desired, look };
}

function cameraModeShot() {
  const pos = bike.group.position;
  const f = pathFrame(state.pathT + 0.006);
  const tangent = f.tangent;
  const right = f.right;
  const up = new THREE.Vector3(0, 1, 0);
  const lookBase = pos.clone().add(new THREE.Vector3(0, 2.15, 0));

  if (state.cameraMode === "orbit") {
    const a = state.sceneTime * 0.16 + 0.65;
    return {
      desired: new THREE.Vector3(pos.x + Math.cos(a) * 7.8, pos.y + 3.35, pos.z + Math.sin(a) * 7.8),
      look: lookBase.clone().add(new THREE.Vector3(0, 0.1, 0)),
    };
  }

  if (state.cameraMode === "hero") {
    return {
      desired: pos
        .clone()
        .addScaledVector(tangent, 5.9)
        .addScaledVector(right, 3.05)
        .addScaledVector(up, 1.55),
      look: lookBase.clone().addScaledVector(tangent, 0.1).add(new THREE.Vector3(0, 0.05, 0)),
    };
  }

  if (state.cameraMode === "free") {
    const target = lookBase.clone().add(new THREE.Vector3(0, 0.15, 0));
    const cp = Math.cos(state.freePitch);
    const offset = new THREE.Vector3(
      Math.sin(state.freeYaw) * cp,
      Math.sin(state.freePitch),
      Math.cos(state.freeYaw) * cp,
    ).multiplyScalar(state.freeDist);
    return { desired: target.clone().add(offset), look: target };
  }

  return {
    desired: pos
      .clone()
      .addScaledVector(tangent, -7.2)
      .addScaledVector(right, 2.9)
      .addScaledVector(up, 3.2),
    look: pos
      .clone()
      .addScaledVector(up, 1.7)
      .addScaledVector(tangent, 1.1),
  };
}

function updateCamera(dt, snap = false) {
  const modeShot = cameraModeShot();
  const cinematic = cinematicShot();
  let desired = modeShot.desired;
  let look = modeShot.look;

  if (!state.entered) {
    desired = cinematic.desired;
    look = cinematic.look;
  } else if (state.introTransition > 0) {
    const t = 1 - state.introTransition;
    const e = 1 - Math.pow(1 - t, 3);
    desired = cinematic.desired.clone().lerp(modeShot.desired, e);
    look = cinematic.look.clone().lerp(modeShot.look, e);
  }

  if (snap) {
    camPos.copy(desired);
    lookTarget.copy(look);
    camera.position.copy(camPos);
    camera.lookAt(lookTarget);
    return;
  }

  const lambda = !state.entered ? 0.8 : state.introTransition > 0 ? 1.8 : 4.8;
  camPos.lerp(desired, 1 - Math.exp(-lambda * dt));
  lookTarget.lerp(look, 1 - Math.exp(-lambda * 0.75 * dt));
  if (camPos.y < 0.7) camPos.y = 0.7;

  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(lookTarget);

  const targetFov = 42 + (state.speed / 8) * 2.4;
  const nextFov = damp(camera.fov, targetFov, 2.2, dt);
  if (Math.abs(nextFov - camera.fov) > 0.001) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
}

function setCameraMode(mode, announce = true) {
  state.cameraMode = mode;
  cameraLabel.textContent = cameraModeNames[mode];
  if (announce && state.entered) toast(cameraToast[mode]);
}

function cycleCamera() {
  const order = ["follow", "orbit", "hero"];
  const index = order.indexOf(state.cameraMode);
  setCameraMode(order[(index + 1) % order.length]);
}

function syncFreeFromCamera() {
  const target = bike.group.position.clone().add(new THREE.Vector3(0, 2.3, 0));
  const offset = camera.position.clone().sub(target);
  const dist = Math.max(3.2, offset.length());
  state.freeDist = clamp(dist, 3.2, 15);
  state.freePitch = clamp(Math.asin(clamp(offset.y / dist, -0.98, 0.98)), 0.04, 1.15);
  state.freeYaw = Math.atan2(offset.x, offset.z);
  if (state.cameraMode !== "free") setCameraMode("free", false);
}

function toast(message, duration = 2700) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), duration);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—:—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateHud() {
  const kmh = state.speed * 3.6;
  speedValue.textContent = kmh.toFixed(1).padStart(4, "0");
  distanceValue.textContent = (state.distance / 1000).toFixed(2);
  lapValue.textContent = String(state.lapCount).padStart(2, "0");
  lapTimeEl.textContent = formatTime(state.rideClock - state.lapStart);
  bestTimeEl.textContent = state.bestLap ? formatTime(state.bestLap) : "—:—";
  lapProgress.style.width = `${(state.pathT * 100).toFixed(1)}%`;
  cadenceValue.textContent = String(Math.round(18 + state.speed * 14));
  speedRange.value = String(Math.round((state.targetSpeed / 8) * 100));
  if (drawcallsValue) drawcallsValue.textContent = String(renderer.info.render.calls);
}

function openNotes() {
  closePhotoMode();
  app.classList.add("is-notes");
  notesEl.removeAttribute("inert");
  notesEl.setAttribute("aria-hidden", "false");
  notesBackdrop.setAttribute("aria-hidden", "false");
  drawcallsValue.textContent = String(renderer.info.render.calls);
}

function closeNotes() {
  app.classList.remove("is-notes");
  notesEl.setAttribute("aria-hidden", "true");
  notesEl.setAttribute("inert", "");
  notesBackdrop.setAttribute("aria-hidden", "true");
}

function enterPhotoMode() {
  if (!state.entered) return;
  closeNotes();
  app.classList.add("is-photo");
  photoUI.removeAttribute("inert");
  photoUI.setAttribute("aria-hidden", "false");
  const now = new Date();
  photoDate.textContent = `${now.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).toUpperCase()} · 35°14′N 139°06′E`;
  updateCamera(0.016, true);
}

function closePhotoMode() {
  app.classList.remove("is-photo");
  photoUI.setAttribute("aria-hidden", "true");
  photoUI.setAttribute("inert", "");
}

async function capturePhoto() {
  if (!state.entered || photoBusy) return;
  photoBusy = true;
  flash.classList.remove("is-firing");
  void flash.offsetWidth;
  flash.classList.add("is-firing");
  audio?.shutter();

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 90);
  });
  await document.fonts.ready.catch(() => {});
  composer.render();

  const src = renderer.domElement;
  const W = 2400;
  const H = 1350;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#041f23";
  ctx.fillRect(0, 0, W, H);

  const scale = Math.max(W / src.width, H / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);

  const grad = ctx.createLinearGradient(0, H - 560, 0, H);
  grad.addColorStop(0, "rgba(3,24,27,0)");
  grad.addColorStop(0.55, "rgba(3,24,27,0.52)");
  grad.addColorStop(1, "rgba(3,24,27,0.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - 560, W, 560);

  ctx.strokeStyle = "rgba(243,232,211,0.78)";
  ctx.lineWidth = 3;
  ctx.strokeRect(54, 54, W - 108, H - 108);

  ctx.fillStyle = "#f3e8d3";
  ctx.textAlign = "left";
  ctx.font = '400 112px "Cormorant Garamond Variable", Georgia, serif';
  ctx.fillText("PELICAN / VÉLO", 112, H - 192);

  ctx.font = '22px "DM Mono", Consolas, monospace';
  ctx.fillStyle = "rgba(243,232,211,0.78)";
  ctx.fillText("A SEASIDE DAYDREAM · 35°14′N 139°06′E", 116, H - 124);

  ctx.textAlign = "right";
  ctx.fillText(state.night > 0.5 ? "MIDNIGHT" : "GOLDEN HOUR", W - 116, H - 124);
  ctx.font = '18px "DM Mono", Consolas, monospace';
  ctx.fillStyle = "rgba(243,232,211,0.48)";
  ctx.fillText(dateStamp(), W - 116, 110);

  // A little paper grain
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;

  const blob = await new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.94));
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pelican-velo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("照片已放进你的下载文件夹。");
  } else {
    toast("照片没有冲洗出来，再试一次？");
  }

  photoBusy = false;
}

function dateStamp() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

async function toggleSound(force) {
  if (!audio) return;
  const wantOn = typeof force === "boolean" ? force : !(soundBtn.getAttribute("aria-pressed") === "true");
  if (wantOn) {
    await audio.start();
    audio.setMuted(false);
    soundBtn.setAttribute("aria-pressed", "true");
    soundBtn.setAttribute("aria-label", "静音");
    app.classList.remove("is-muted");
    if (!state.entered) toast("海风的声音，先借给你。");
  } else {
    audio.setMuted(true);
    soundBtn.setAttribute("aria-pressed", "false");
    soundBtn.setAttribute("aria-label", "开启声音");
    app.classList.add("is-muted");
    toast("世界安静了下来。");
  }
}

function toggleNight() {
  state.nightTarget = state.nightTarget > 0.5 ? 0 : 1;
  const isNight = state.nightTarget > 0.5;
  app.classList.toggle("is-night", isNight);
  if (themeLabel) themeLabel.textContent = isNight ? "MIDNIGHT" : "GOLDEN HOUR";
  themeBtn.setAttribute("aria-label", isNight ? "切换到黄金时刻" : "切换到午夜");
  weatherLabel.textContent = isNight ? "CLEAR · 13°C" : "CLEAR · 21°C";
  toast(isNight ? "午夜。灯塔开始工作了。" : "黄金时刻。海面正在发光。");
}

function togglePause(force) {
  const next = typeof force === "boolean" ? force : !state.paused;
  if (next === state.paused) return;
  state.paused = next;
  app.classList.toggle("is-paused", next);
  if (next) {
    state.speedBeforePause = state.targetSpeed;
    state.targetSpeed = 0;
    pauseBtn.setAttribute("aria-label", "继续骑行");
    toast("停一会儿，也很好。");
  } else {
    state.targetSpeed = Math.max(3.2, state.speedBeforePause);
    pauseBtn.setAttribute("aria-label", "暂停");
    toast("继续出发。");
  }
  audio?.setPaused(next);
}

function setSpeed(value, announce = false) {
  const wasPaused = state.paused;
  if (wasPaused && value > 0) togglePause(false);
  state.targetSpeed = clamp(value, 0, 8);
  if (announce) {
    toast(`速度 · ${(state.targetSpeed * 3.6).toFixed(0)} km/h`);
  }
}

function ringBell() {
  bike.ringBell();
  audio?.bell();
  pelican.triggerBlink();
  toast(["铃—— 海风替你按了铃。", "铃。远处的海鸥抬了一下头。", "铃—— 前面没有车，也没有人。"][Math.floor(Math.random() * 3)]);
}

function squawk() {
  pelican.triggerSquawk();
  audio?.squawk();
  toast(
    [
      "它看了你一眼，然后继续赶路。",
      "这条鱼是它的乘客，不是晚餐。",
      "鹈鹕说：海风刚好。",
      "别按了，它正在想事情。",
    ][Math.floor(Math.random() * 4)],
  );
}

function enterExperience() {
  if (state.entered) return;
  state.entered = true;
  state.introTransition = 1;
  state.rideClock = 0;
  state.lapStart = 0;
  state.lapCount = 1;
  state.lapArmed = false;
  state.speed = Math.max(state.speed, 2.8);
  state.targetSpeed = 3.5;
  app.classList.add("is-entered");
  app.scrollTop = 0;
  app.scrollLeft = 0;
  toggleSound(true);
  setTimeout(() => toast("沿着海堤走。不必赶时间。", 3400), 900);
}

function showHero() {
  state.entered = false;
  state.introTransition = 1;
  state.paused = false;
  state.targetSpeed = 2.2;
  state.speed = 2.2;
  state.rideClock = 0;
  state.lapStart = 0;
  state.lapCount = 1;
  state.lapArmed = false;
  app.classList.remove("is-entered", "is-photo", "is-notes", "is-paused");
  notesEl.setAttribute("aria-hidden", "true");
  notesEl.setAttribute("inert", "");
  notesBackdrop.setAttribute("aria-hidden", "true");
  photoUI.setAttribute("aria-hidden", "true");
  photoUI.setAttribute("inert", "");
  setCameraMode("follow", false);
  updateCamera(0.016, true);
}

function resetRide() {
  state.pathT = 0.12;
  state.distance = 0;
  state.rideClock = 0;
  state.lapStart = 0;
  state.lapCount = 1;
  state.lapArmed = false;
  state.speed = 3.2;
  state.targetSpeed = 3.2;
  state.lean = 0;
  state.paused = false;
  closeNotes();
  closePhotoMode();
  if (!state.entered) {
    state.entered = true;
    app.classList.add("is-entered");
  }
  placeBikeFrame();
  updateCamera(0.016, true);
  toast("重新出发。海还是那片海。");
}

function setFreeMode() {
  if (!state.entered) return;
  syncFreeFromCamera();
}

function onPelicanClick(event) {
  if (!state.entered) return;
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(pelican.root, true);
  if (hits.length) squawk();
}

function onPointerDown(event) {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  movedDistance = 0;
  canvas.setPointerCapture(event.pointerId);
  cursorEl.classList.add("is-down");
}

function onPointerMove(event) {
  if (finePointer) {
    cursorEl.style.translate = `${event.clientX}px ${event.clientY}px`;
    cursorEl.classList.add("is-on");
  }

  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  movedDistance += Math.abs(dx) + Math.abs(dy);

  if (state.entered && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
    if (state.cameraMode !== "free") syncFreeFromCamera();
    state.freeYaw -= dx * 0.0052;
    state.freePitch = clamp(state.freePitch + dy * 0.0042, 0.04, 1.1);
  }
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  if (state.entered && movedDistance < 7) onPelicanClick(event);
  drag = null;
  cursorEl.classList.remove("is-down");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

function onWheel(event) {
  if (!state.entered) return;
  event.preventDefault();
  if (state.cameraMode !== "free") syncFreeFromCamera();
  state.freeDist = clamp(state.freeDist * (1 + Math.sign(event.deltaY) * 0.08), 3.2, 15);
}

function applyPixelRatio(pr) {
  pixelRatio = pr;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(window.innerWidth, window.innerHeight);
  qualityLabel.textContent = `WEBGL2 · ${quality}`;
}

function onResize() {
  if (!camera || !composer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  bloomPass.setSize(w * pixelRatio, h * pixelRatio);
}

function bindUi() {
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (el.tagName === "A") event.preventDefault();

    switch (action) {
      case "home":
        showHero();
        break;
      case "sound":
        toggleSound();
        break;
      case "theme":
        toggleNight();
        break;
      case "notes":
        openNotes();
        break;
      case "notes-close":
        closeNotes();
        break;
      case "replay":
        closeNotes();
        showHero();
        break;
      case "reset-ride":
        resetRide();
        break;
      case "camera":
        cycleCamera();
        break;
      case "bell":
        ringBell();
        break;
      case "photo":
        enterPhotoMode();
        break;
      case "photo-close":
        closePhotoMode();
        break;
      case "capture":
        capturePhoto();
        break;
      case "pause":
        togglePause();
        break;
      case "accelerate":
        setSpeed(state.targetSpeed + 0.55);
        break;
      case "decelerate":
        setSpeed(state.targetSpeed - 0.55);
        break;
      default:
        break;
    }
  });

  notesBackdrop.addEventListener("click", closeNotes);
  document.getElementById("enter").addEventListener("click", enterExperience);
  speedRange.addEventListener("input", (event) => setSpeed((parseFloat(event.target.value) / 100) * 8));

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", () => {
    if (!state.entered) return;
    cycleCamera();
  });

  window.addEventListener("resize", onResize);

  window.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (event.code === "Enter" && !state.entered) {
      enterExperience();
      return;
    }
    if (event.code === "Escape") {
      if (app.classList.contains("is-photo")) closePhotoMode();
      else if (app.classList.contains("is-notes")) closeNotes();
      return;
    }
    if (!state.entered) return;

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        event.preventDefault();
        setSpeed(state.targetSpeed + 0.5);
        break;
      case "KeyS":
      case "ArrowDown":
        event.preventDefault();
        setSpeed(state.targetSpeed - 0.5);
        break;
      case "Space":
        event.preventDefault();
        if (!event.repeat) {
          state.speedBeforeBrake = state.targetSpeed;
          setSpeed(0);
        }
        break;
      case "KeyC":
        cycleCamera();
        break;
      case "KeyB":
        ringBell();
        break;
      case "KeyN":
        toggleNight();
        break;
      case "KeyM":
        toggleSound();
        break;
      case "KeyP":
        if (app.classList.contains("is-photo")) closePhotoMode();
        else enterPhotoMode();
        break;
      case "KeyR":
        resetRide();
        break;
      case "KeyF":
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.().catch(() => {});
        break;
      default:
        break;
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space" && state.entered && state.targetSpeed === 0 && !state.paused) {
      setSpeed(Math.max(2.8, state.speedBeforeBrake));
    }
  });

  if (finePointer) {
    document.body.classList.add("has-cursor");
    document.addEventListener("pointerover", (event) => {
      if (event.target.closest("button, a, input, .enter")) cursorEl.classList.add("is-hover");
    });
    document.addEventListener("pointerout", (event) => {
      if (event.target.closest("button, a, input, .enter")) cursorEl.classList.remove("is-hover");
    });
    document.addEventListener("mouseleave", () => cursorEl.classList.remove("is-on"));
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      lastTime = 0;
    } else {
      lastTime = performance.now();
    }
  });
}

function step(dt) {
  dt = Math.min(dt, 0.05);
  if (app.scrollTop !== 0) app.scrollTop = 0;
  if (app.scrollLeft !== 0) app.scrollLeft = 0;
  renderer.info.reset();
  state.sceneTime += dt;
  state.night = damp(state.night, state.nightTarget, 1.9, dt);
  state.introTransition = Math.max(0, state.introTransition - dt / 3.6);

  const driveDt = state.paused ? 0 : dt;
  state.speed = damp(state.speed, state.paused ? 0 : state.targetSpeed, 2.5, dt);

  let distanceDelta = 0;
  if (driveDt > 0) {
    distanceDelta = state.speed * driveDt;
    state.distance += distanceDelta;
    state.pathT += distanceDelta / PATH_LENGTH;

    if (state.entered) state.rideClock += driveDt;

    if (state.pathT >= 1) {
      state.pathT -= 1;
      if (state.entered) {
        if (!state.lapArmed) {
          state.lapArmed = true;
          state.lapStart = state.rideClock;
        } else {
          const lap = state.rideClock - state.lapStart;
          if (lap > 5) {
            if (!state.bestLap || lap < state.bestLap) {
              state.bestLap = lap;
              try {
                localStorage.setItem("pelican-best-lap", String(lap));
              } catch {
                // ignore
              }
              toast(`新纪录 · ${formatTime(lap)}`, 3200);
            } else {
              toast(`第 ${state.lapCount + 1} 圈 · ${formatTime(lap)}`, 2600);
            }
          }
          state.lapCount += 1;
          state.lapStart = state.rideClock;
        }
      }
    }
  }

  // Lean into the curve
  const f = pathFrame(state.pathT);
  const ahead = pathFrame(state.pathT + 0.012);
  const cross = f.tangent.x * ahead.tangent.z - f.tangent.z * ahead.tangent.x;
  const leanTarget = clamp((cross / 0.012) * 0.15 * (0.5 + state.speed / 5), -0.26, 0.26);
  state.lean = damp(state.lean, leanTarget, 3.6, dt);

  placeBikeFrame();
  const pedals = bike.getPedals();
  bike.update(dt, state.speed, state.distance, state.night);
  pelican.update(dt, state.sceneTime, state.speed, pedals, state.lean);
  world.update(dt, state.sceneTime, state.night);

  sky.uniforms.uTime.value = state.sceneTime;
  ocean.uniforms.uTime.value = state.sceneTime;
  applyPalette(state.night);

  gradePass.uniforms.uTime.value = state.sceneTime;
  updateCamera(dt);

  audio?.update(dt, state.speed, distanceDelta, state.night);

  composer.render();

  uiTimer += dt;
  if (uiTimer > 0.12) {
    uiTimer = 0;
    updateHud();
  }

  if (!state.drawnOnce) {
    state.drawnOnce = true;
    app.classList.add("is-ready");
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);
  step(dt);

  // Gentle adaptive quality for slower machines
  fpsTimer += dt;
  fpsFrames += 1;
  if (fpsTimer > 5) {
    const fps = fpsFrames / fpsTimer;
    fpsTimer = 0;
    fpsFrames = 0;
    if (fps < 34 && pixelRatio > 0.85 && !isMobile) {
      quality = "ECO";
      applyPixelRatio(Math.max(0.85, pixelRatio - 0.25));
    } else if (fps < 28 && pixelRatio > 0.8 && isMobile) {
      quality = "ECO";
      applyPixelRatio(0.8);
    }
  }
}

async function boot() {
  bootStart = performance.now();
  bindUi();

  try {
    setProgress(4, "正在铺开海面");
    await nextFrame();

    setupRenderer();
    setupEnvironment();

    setProgress(14, "正在调亮黄昏");
    await nextFrame();

    sky = makeSky();
    scene.add(sky.mesh);
    ocean = makeOcean(scene);

    setProgress(25, "正在升起灯塔");
    await nextFrame();

    world = createWorld(scene, renderer);
    if (isMobile) {
      world.sun.shadow.mapSize.set(1024, 1024);
    }

    setProgress(49, "正在铺开环形海堤");
    await nextFrame();

    bike = createBike();
    pelican = createPelican();
    bike.group.add(pelican.root);
    scene.add(bike.group);

    setProgress(66, "正在给鹈鹕戴好帽子");
    await nextFrame();

    setupPost();
    applyPalette(0);
    placeBikeFrame();

    // A first quiet frame, then compile the shaders before we reveal the world.
    updateCamera(0.016, true);
    world.update(0.016, 0, 0);
    bike.update(0.016, 0, 0, 0);
    pelican.update(0.016, 0, 0, bike.getPedals(), 0);
    sky.uniforms.uTime.value = 0;
    ocean.uniforms.uTime.value = 0;
    composer.render();

    setProgress(82, "正在教它保持平衡");
    await nextFrame();

    try {
      renderer.compile(scene, camera);
    } catch (error) {
      console.warn("Shader precompile skipped", error);
    }

    setProgress(94, "正在编译光");
    await nextFrame();

    audio = new Soundscape();
    cameraModeShot();
    updateCamera(0.016, true);
    placeBikeFrame();
    world.update(0, 0, 0);
    bike.update(0, 0, 0, 0);
    pelican.update(0, 0, 0, bike.getPedals(), 0);
    applyPalette(0);
    composer.render();

    setProgress(100, "可以出发了");
    const elapsed = performance.now() - bootStart;
    if (elapsed < 1500 && !reducedMotion) await sleep(1500 - elapsed);
    else await sleep(180);

    updateHud();
    app.classList.remove("is-loading");
    app.classList.add("is-ready");

    window.__pelican = {
      state,
      world,
      sky,
      ocean,
      bike,
      pelican,
      step(count = 1, dt = 1 / 60) {
        for (let i = 0; i < count; i += 1) step(dt);
        updateHud();
        return this.info();
      },
      enter: enterExperience,
      night: toggleNight,
      camera: cycleCamera,
      notes: openNotes,
      photo: enterPhotoMode,
      closePhoto: closePhotoMode,
      capture: capturePhoto,
      info() {
        return {
          entered: state.entered,
          mode: state.cameraMode,
          night: state.night,
          nightTarget: state.nightTarget,
          speed: state.speed,
          targetSpeed: state.targetSpeed,
          distance: state.distance,
          pathT: state.pathT,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          size: [renderer.domElement.width, renderer.domElement.height],
          errors: window.__pelicanErrors,
        };
      },
    };

    requestAnimationFrame(animate);
  } catch (error) {
    showFatal(error);
  }
}

boot();
