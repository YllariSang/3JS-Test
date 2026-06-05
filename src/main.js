import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b10);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2.5, 6.5);
// Camera must be in scene for attached lights to work
scene.add(camera);
const cameraLight = new THREE.PointLight(0xfff8ee, 0.85, 40, 1.4);
camera.add(cameraLight);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = false;
controls.enableRotate = false;
controls.target.set(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.55);
directionalLight.position.set(4, 8, 6);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 70;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

const gltfLoader = new GLTFLoader();
const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const navDebounceMs = 140;

// Local-space outward normals for each cube face, used for dynamic adjacency
const FACE_LOCAL_NORMALS = {
  front:  new THREE.Vector3(0, 0,  1),
  back:   new THREE.Vector3(0, 0, -1),
  right:  new THREE.Vector3(1, 0,  0),
  left:   new THREE.Vector3(-1, 0, 0),
  top:    new THREE.Vector3(0,  1,  0),
  bottom: new THREE.Vector3(0, -1,  0)
};

const faceConfigs = [
  {
    id: 'front',
    label: 'Hero',
    euler: new THREE.Euler(0, 0, 0, 'XYZ'),
    anchorCandidates: ['Anchor_Front', 'Anchor_Hero', 'anchor_front', 'anchor_hero']
  },
  {
    id: 'right',
    label: 'Projects',
    euler: new THREE.Euler(0, -Math.PI / 2, 0, 'XYZ'),
    anchorCandidates: ['Anchor_Right', 'anchor_right']
  },
  {
    id: 'back',
    label: 'About',
    euler: new THREE.Euler(0, Math.PI, 0, 'XYZ'),
    anchorCandidates: ['Anchor_Back', 'anchor_back']
  },
  {
    id: 'left',
    label: 'Contact',
    euler: new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'),
    anchorCandidates: ['Anchor_Left', 'anchor_left']
  },
  {
    id: 'top',
    label: 'Gallery',
    euler: new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'),
    anchorCandidates: ['Anchor_Top', 'anchor_top']
  },
  {
    id: 'bottom',
    label: 'More',
    euler: new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'),
    anchorCandidates: ['Anchor_Bottom', 'anchor_bottom']
  }
];

const state = {
  cubeRoot: null,
  activeFaceId: 'front',
  faceById: {},
  faceIcons: {},
  allIcons: [],
  isTransitioning: false,
  lastNavAt: 0,
  hasPlayedIntro: false,
  leftArrowRoot: null,
  upArrowRoot: null,
  downArrowRoot: null,
  rightArrowRoot: null,
  leftArrowHits: [],
  upArrowHits: [],
  downArrowHits: [],
  rightArrowHits: [],
  navQueue: [],       // stores direction string for queued navigation
  hoveredIcon: null,  // currently hovered icon object
  meshToIcon: new Map() // hit mesh → icon root lookup
};

const ui = createOverlayUI();
const infoPanel = document.getElementById('info-panel');
setInfo('Use Arrow keys or the on-screen D-pad to navigate all 6 faces.');

function createOverlayUI() {
  const root = document.createElement('div');
  root.className = 'cube-ui';

  const upButton = document.createElement('button');
  upButton.className = 'cube-nav cube-nav-up';
  upButton.type = 'button';
  upButton.setAttribute('aria-label', 'Face up');
  upButton.textContent = '^';

  const downButton = document.createElement('button');
  downButton.className = 'cube-nav cube-nav-down';
  downButton.type = 'button';
  downButton.setAttribute('aria-label', 'Face down');
  downButton.textContent = 'v';

  const leftButton = document.createElement('button');
  leftButton.className = 'cube-nav cube-nav-left';
  leftButton.type = 'button';
  leftButton.setAttribute('aria-label', 'Face left');
  leftButton.textContent = '<';

  const rightButton = document.createElement('button');
  rightButton.className = 'cube-nav cube-nav-right';
  rightButton.type = 'button';
  rightButton.setAttribute('aria-label', 'Face right');
  rightButton.textContent = '>';

  const label = document.createElement('div');
  label.className = 'cube-face-label';
  label.textContent = 'Hero';

  root.append(upButton, leftButton, rightButton, downButton, label);
  document.body.append(root);

  return {
    root,
    upButton,
    downButton,
    leftButton,
    rightButton,
    label
  };
}

function setInfo(message) {
  if (!infoPanel) {
    return;
  }

  infoPanel.textContent = message;
  infoPanel.classList.remove('is-hidden');
}

function setFaceLabel(label) {
  ui.label.textContent = label;
}

function updatePointerPosition(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
}

function getObjectByNames(root, names) {
  for (let i = 0; i < names.length; i += 1) {
    const found = root.getObjectByName(names[i]);
    if (found) {
      return found;
    }
  }

  return null;
}

function collectMeshHits(root) {
  const hits = [];
  if (!root) {
    return hits;
  }

  root.traverse((child) => {
    if (child.isMesh) {
      hits.push(child);
    }
  });

  return hits;
}

function setObjectOpacity(object3d, opacity) {
  object3d.traverse((child) => {
    if (!child.isMesh || !child.material || child.userData.isBody) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = opacity;
      material.needsUpdate = true;
    });
  });
}

function hideAllIcons() {
  state.allIcons.forEach((icon) => {
    gsap.killTweensOf(icon.scale);
    gsap.killTweensOf(icon.position);
    gsap.killTweensOf(icon.userData.opacityProxy);

    // Do NOT set icon.visible = false — that propagates through the hierarchy
    // and can hide cube body geometry. Rely on opacity = 0 for visual hiding.
    icon.scale.copy(icon.userData.baseScale).multiplyScalar(0.6);
    icon.position.copy(icon.userData.basePosition).add(new THREE.Vector3(0, -0.08, 0));
    icon.userData.opacityProxy.value = 0;
    setObjectOpacity(icon, 0);
  });
}

function frameCubeInView(animated = true) {
  if (!state.cubeRoot) {
    return;
  }

  const bounds = new THREE.Box3().setFromObject(state.cubeRoot);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center.clone();

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distV = sphere.radius / Math.sin(vFov / 2);
  const distH = sphere.radius / Math.sin(hFov / 2);
  const distance = Math.max(distV, distH) * 1.1;

  const flatViewDirection = new THREE.Vector3(0, 0, 1);
  const nextPosition = target.clone().addScaledVector(flatViewDirection, distance);

  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);

  const duration = animated ? 0.8 : 0;
  gsap.to(controls.target, {
    duration,
    x: target.x,
    y: target.y,
    z: target.z,
    ease: 'power2.out'
  });

  gsap.to(camera.position, {
    duration,
    x: nextPosition.x,
    y: nextPosition.y,
    z: nextPosition.z,
    ease: 'power2.out',
    onUpdate: () => controls.update()
  });
}

// Dynamically finds the nearest face in screen-space for the given direction by
// projecting each face's world-space normal against the camera's right/up axes.
function getAdjacentFace(currentFaceId, direction) {
  if (!state.cubeRoot) {
    return currentFaceId;
  }

  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  camera.matrixWorld.extractBasis(cameraRight, cameraUp, new THREE.Vector3());

  const matrixWorld = state.cubeRoot.matrixWorld;
  let bestFaceId = currentFaceId;
  let bestScore = -Infinity;

  for (const [faceId, localNormal] of Object.entries(FACE_LOCAL_NORMALS)) {
    if (faceId === currentFaceId) {
      continue;
    }

    const worldNormal = localNormal.clone().transformDirection(matrixWorld);
    let score;

    if (direction === 'right') {
      score = worldNormal.dot(cameraRight);
    } else if (direction === 'left') {
      score = -worldNormal.dot(cameraRight);
    } else if (direction === 'up') {
      score = worldNormal.dot(cameraUp);
    } else {
      score = -worldNormal.dot(cameraUp);
    }

    if (score > bestScore) {
      bestScore = score;
      bestFaceId = faceId;
    }
  }

  return bestFaceId;
}

// navigate queues input if transitioning; always resolves direction from current face
function navigate(direction) {
  if (state.isTransitioning) {
    state.navQueue = [direction]; // latest wins
    return;
  }

  rotateToFace(getAdjacentFace(state.activeFaceId, direction));
}

function showFaceContent(faceId) {
  hideAllIcons();

  const faceConfig = state.faceById[faceId];
  if (!faceConfig) {
    return;
  }

  const icons = state.faceIcons[faceId] ?? [];
  if (icons.length === 0) {
    console.warn(`No icons found for face ${faceId}.`);
    return;
  }

  icons.forEach((icon, index) => {
    const baseScale = icon.userData.baseScale;
    const basePosition = icon.userData.basePosition;
    const proxy = icon.userData.opacityProxy;

    icon.visible = true;
    icon.scale.copy(baseScale).multiplyScalar(0.6);
    icon.position.copy(basePosition).add(new THREE.Vector3(0, -0.08, 0));
    proxy.value = 0;
    setObjectOpacity(icon, 0);

    const delay = index * 0.08;

    gsap.to(icon.scale, {
      duration: 0.45,
      delay,
      x: baseScale.x,
      y: baseScale.y,
      z: baseScale.z,
      ease: 'back.out(1.7)'
    });

    gsap.to(icon.position, {
      duration: 0.38,
      delay,
      y: basePosition.y,
      ease: 'power2.out'
    });

    gsap.to(proxy, {
      value: 1,
      duration: 0.38,
      delay,
      ease: 'power2.out',
      onUpdate: () => setObjectOpacity(icon, proxy.value)
    });
  });
}

function rotateToFace(nextFaceId, options = {}) {
  if (!state.cubeRoot) {
    return;
  }

  const faceConfig = state.faceById[nextFaceId];
  if (!faceConfig) {
    console.warn(`Unknown face id: ${nextFaceId}`);
    return;
  }

  if (state.isTransitioning && !options.force) {
    return;
  }

  const now = performance.now();
  if (!options.force && now - state.lastNavAt < navDebounceMs) {
    return;
  }

  state.lastNavAt = now;
  state.isTransitioning = true;

  // Clear hover state and hide icons at the start of each rotation
  if (state.hoveredIcon) {
    unhoverIcon(state.hoveredIcon);
    state.hoveredIcon = null;
  }
  hideAllIcons();

  const fromQuaternion = state.cubeRoot.quaternion.clone();
  const toQuaternion = faceConfig.quaternion.clone();
  const tweenState = { t: 0 };

  gsap.to(tweenState, {
    t: 1,
    duration: options.duration ?? 0.62,
    ease: 'power2.inOut',
    overwrite: true,
    onUpdate: () => {
      state.cubeRoot.quaternion.slerpQuaternions(fromQuaternion, toQuaternion, tweenState.t);
    },
    onComplete: () => {
      state.cubeRoot.quaternion.copy(toQuaternion);
      state.cubeRoot.rotation.setFromQuaternion(toQuaternion, 'XYZ');
      state.activeFaceId = nextFaceId;
      setFaceLabel(faceConfig.label);
      showFaceContent(nextFaceId);
      state.isTransitioning = false;
      // Drain queued direction (re-evaluated from new activeFaceId)
      if (state.navQueue.length > 0) {
        navigate(state.navQueue.shift());
      }
    }
  });
}

function playIntroRoll() {
  if (!state.cubeRoot || state.hasPlayedIntro) {
    return;
  }

  state.hasPlayedIntro = true;
  state.isTransitioning = true;

  const rollDuration = THREE.MathUtils.randFloat(1.2, 1.8);
  const startX = THREE.MathUtils.randFloat(0.1, 0.45);
  const startY = THREE.MathUtils.randFloat(0.1, 0.45);
  const startZ = THREE.MathUtils.randFloat(0.1, 0.45);

  state.cubeRoot.rotation.set(startX, startY, startZ);

  const timeline = gsap.timeline();
  timeline.to(state.cubeRoot.rotation, {
    duration: rollDuration,
    x: startX + Math.PI * THREE.MathUtils.randFloat(3.4, 4.2),
    y: startY + Math.PI * THREE.MathUtils.randFloat(4.6, 5.4),
    z: startZ + Math.PI * THREE.MathUtils.randFloat(2.8, 3.5),
    ease: 'power3.out'
  });

  timeline.to({}, {
    duration: 0.45,
    ease: 'power2.out',
    onStart: () => {
      frameCubeInView(true);
      rotateToFace('front', { force: true, duration: 0.45 });
    },
    onComplete: () => {
      state.isTransitioning = false;
    }
  });
}

function resolveIconsUnderAnchor(anchor) {
  const icons = [];
  if (!anchor) {
    return icons;
  }

  anchor.traverse((child) => {
    if (!child.isObject3D || child === anchor) {
      return;
    }

    if (/icon/i.test(child.name)) {
      icons.push(child);
    }
  });

  return icons;
}

function resolveFaceAnchorsAndIcons(cubeRoot) {
  const fallbackIcon = cubeRoot.getObjectByName('Venti_Icon');

  faceConfigs.forEach((face) => {
    const anchor = getObjectByNames(cubeRoot, face.anchorCandidates);
    face.anchor = anchor ?? null;

    if (anchor && /^Anchor_/i.test(anchor.name)) {
      const labelFromAnchor = anchor.name
        .replace(/^Anchor_/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      if (labelFromAnchor.length > 0) {
        face.label = labelFromAnchor;
      }
    }

    const icons = resolveIconsUnderAnchor(anchor);
    if (icons.length === 0 && fallbackIcon) {
      icons.push(fallbackIcon);
    }

    if (!anchor) {
      console.warn(`Missing anchor for face ${face.id}. Tried: ${face.anchorCandidates.join(', ')}`);
    }

    state.faceIcons[face.id] = icons;
  });

  const uniqueIcons = new Set();
  Object.values(state.faceIcons).forEach((icons) => {
    icons.forEach((icon) => uniqueIcons.add(icon));
  });

  state.allIcons = Array.from(uniqueIcons);
  state.allIcons.forEach((icon) => {
    // Un-mark icon meshes so setObjectOpacity can affect them
    icon.traverse((child) => {
      if (child.isMesh) { child.userData.isBody = false; }
    });
    icon.userData.baseScale = icon.scale.clone();
    icon.userData.basePosition = icon.position.clone();
    icon.userData.opacityProxy = { value: 0 };
    icon.visible = false;
    setObjectOpacity(icon, 0);
  });

  // Build mesh → icon-root reverse lookup for hover raycasting
  state.meshToIcon = new Map();
  state.allIcons.forEach((icon) => {
    icon.traverse((child) => {
      if (child.isMesh) {
        state.meshToIcon.set(child, icon);
      }
    });
  });
}

function hoverIcon(icon) {
  if (!icon) {
    return;
  }

  const baseScale = icon.userData.baseScale ?? icon.scale.clone();
  gsap.killTweensOf(icon.scale);
  gsap.killTweensOf(icon.rotation);
  gsap.to(icon.scale, { x: baseScale.x * 1.1, y: baseScale.y * 1.1, z: baseScale.z * 1.1, duration: 0.22, ease: 'power2.out' });
  gsap.to(icon.rotation, { z: 0.07, duration: 0.22, ease: 'power2.out' });

  icon.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (m.emissive !== undefined) {
        child.userData.origEmissive = m.emissive.clone();
        m.emissive.setHex(0x223355);
        m.needsUpdate = true;
      }
    });
  });
}

function unhoverIcon(icon) {
  if (!icon) {
    return;
  }

  const baseScale = icon.userData.baseScale ?? icon.scale.clone();
  gsap.killTweensOf(icon.scale);
  gsap.killTweensOf(icon.rotation);
  gsap.to(icon.scale, { x: baseScale.x, y: baseScale.y, z: baseScale.z, duration: 0.18, ease: 'power2.out' });
  gsap.to(icon.rotation, { z: 0, duration: 0.18, ease: 'power2.out' });

  icon.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (m.emissive !== undefined && child.userData.origEmissive) {
        m.emissive.copy(child.userData.origEmissive);
        m.needsUpdate = true;
      }
    });
  });
}

const debug = { enabled: false, gizmos: [] };

function toggleDebugMode() {
  debug.enabled = !debug.enabled;
  debug.gizmos.forEach((g) => { g.visible = debug.enabled; });
  setInfo(
    debug.enabled
      ? 'DEBUG: Anchor gizmos visible (green = found, red = missing). Press D to hide.'
      : 'Use Arrow keys or the on-screen D-pad to navigate all 6 faces.'
  );
}

function createDebugGizmos() {
  debug.gizmos.forEach((g) => g.parent?.remove(g));
  debug.gizmos.length = 0;

  if (!state.cubeRoot) {
    return;
  }

  const geoSphere = new THREE.SphereGeometry(0.06, 8, 8);
  faceConfigs.forEach((face) => {
    const mat = new THREE.MeshBasicMaterial({
      color: face.anchor ? 0x00ffaa : 0xff4444,
      depthTest: false
    });
    const gizmo = new THREE.Mesh(geoSphere, mat);
    gizmo.renderOrder = 999;

    if (face.anchor) {
      const worldPos = new THREE.Vector3();
      face.anchor.getWorldPosition(worldPos);
      state.cubeRoot.worldToLocal(worldPos);
      gizmo.position.copy(worldPos);
    }

    gizmo.visible = debug.enabled;
    state.cubeRoot.add(gizmo);
    debug.gizmos.push(gizmo);
  });
}

function setupInputHandlers() {
  ui.leftButton.addEventListener('click', () => navigate('left'));
  ui.rightButton.addEventListener('click', () => navigate('right'));
  ui.upButton.addEventListener('click', () => navigate('up'));
  ui.downButton.addEventListener('click', () => navigate('down'));

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft')  { event.preventDefault(); navigate('left');  return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); navigate('right'); return; }
    if (event.key === 'ArrowUp')    { event.preventDefault(); navigate('up');    return; }
    if (event.key === 'ArrowDown')  { event.preventDefault(); navigate('down');  return; }
    // Press D to toggle anchor gizmos for Blender alignment checks
    if (event.key === 'd' || event.key === 'D') { toggleDebugMode(); }
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    updatePointerPosition(event);
    raycaster.setFromCamera(mouse, camera);

    // Icon hover: only test visible icons on the currently active face
    const activeIcons = state.faceIcons[state.activeFaceId] ?? [];
    const activeIconMeshes = [];
    activeIcons.forEach((icon) => {
      if (icon.visible) {
        icon.traverse((child) => { if (child.isMesh) activeIconMeshes.push(child); });
      }
    });

    const iconHitObj = raycaster.intersectObjects(activeIconMeshes, false)[0]?.object ?? null;
    const nextHoveredIcon = iconHitObj ? (state.meshToIcon.get(iconHitObj) ?? null) : null;

    if (state.hoveredIcon !== nextHoveredIcon) {
      unhoverIcon(state.hoveredIcon);
      hoverIcon(nextHoveredIcon);
      state.hoveredIcon = nextHoveredIcon;
    }

    if (nextHoveredIcon) {
      document.body.style.cursor = 'pointer';
      return;
    }

    // Arrow 3D object hit check
    const allArrowHits = [
      ...state.leftArrowHits,
      ...state.rightArrowHits,
      ...state.upArrowHits,
      ...state.downArrowHits
    ];
    const hasArrowHit = allArrowHits.length > 0 &&
      raycaster.intersectObjects(allArrowHits, false).length > 0;
    document.body.style.cursor = hasArrowHit ? 'pointer' : 'default';
  });

  renderer.domElement.addEventListener('click', (event) => {
    updatePointerPosition(event);
    raycaster.setFromCamera(mouse, camera);

    if (raycaster.intersectObjects(state.leftArrowHits,  false).length > 0) { navigate('left');  return; }
    if (raycaster.intersectObjects(state.rightArrowHits, false).length > 0) { navigate('right'); return; }
    if (raycaster.intersectObjects(state.upArrowHits,    false).length > 0) { navigate('up');    return; }
    if (raycaster.intersectObjects(state.downArrowHits,  false).length > 0) { navigate('down'); }
    // background click intentionally does nothing to avoid breaking face state
  });
}

function loadCubeModel() {
  gltfLoader.load(
    new URL('./assets/models/AboutCube.glb', import.meta.url).href,
    (gltf) => {
      const cubeRoot = gltf.scene;

      cubeRoot.frustumCulled = false;
      cubeRoot.traverse((child) => {
        child.frustumCulled = false;
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.isBody = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { if (m) { m.side = THREE.DoubleSide; } });
        }
      });

      const bounds = new THREE.Box3().setFromObject(cubeRoot);
      const center = bounds.getCenter(new THREE.Vector3());
      cubeRoot.position.sub(center);

      cubeGroup.add(cubeRoot);
      state.cubeRoot = cubeRoot;

      faceConfigs.forEach((face) => {
        face.quaternion = new THREE.Quaternion().setFromEuler(face.euler);
        state.faceById[face.id] = face;
      });

      resolveFaceAnchorsAndIcons(cubeRoot);
      createDebugGizmos();

      state.leftArrowRoot = getObjectByNames(cubeRoot, ['Arrow_Left', 'arrow_left', 'ArrowLeft']);
      state.rightArrowRoot = getObjectByNames(cubeRoot, ['Arrow_Right', 'arrow_right', 'ArrowRight']);
      state.upArrowRoot = getObjectByNames(cubeRoot, ['Arrow_Up', 'arrow_up', 'ArrowUp']);
      state.downArrowRoot = getObjectByNames(cubeRoot, ['Arrow_Down', 'arrow_down', 'ArrowDown']);

      state.leftArrowHits = collectMeshHits(state.leftArrowRoot);
      state.rightArrowHits = collectMeshHits(state.rightArrowRoot);
      state.upArrowHits = collectMeshHits(state.upArrowRoot);
      state.downArrowHits = collectMeshHits(state.downArrowRoot);

      frameCubeInView(false);
      playIntroRoll();
    },
    undefined,
    (error) => {
      console.error('Failed to load AboutCube.glb', error);
      setInfo('Could not load AboutCube.glb. Check file path and model export.');
    }
  );
}

setupInputHandlers();
loadCubeModel();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  frameCubeInView(false);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

