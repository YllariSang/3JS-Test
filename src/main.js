import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'gsap';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.5, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

const roomGroup = new THREE.Group();
scene.add(roomGroup);

const roomFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: 0x1f2937 })
);
roomFloor.rotation.x = -Math.PI / 2;
roomFloor.position.y = -0.5;
roomFloor.receiveShadow = true;
roomGroup.add(roomFloor);

const roomBackWall = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 4),
  new THREE.MeshStandardMaterial({ color: 0x111827, side: THREE.DoubleSide })
);
roomBackWall.position.set(0, 1.5, -3.5);
roomBackWall.receiveShadow = true;
roomGroup.add(roomBackWall);

const workMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x60a5fa })
);
workMesh.name = 'Work';
workMesh.position.set(-1.8, 0, 0);
workMesh.castShadow = true;
workMesh.receiveShadow = true;
roomGroup.add(workMesh);

const contactMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x34d399 })
);
contactMesh.name = 'Contact';
contactMesh.position.set(0, 0, 0);
contactMesh.castShadow = true;
contactMesh.receiveShadow = true;
roomGroup.add(contactMesh);

const aboutMesh = new THREE.Mesh(
  new THREE.TorusGeometry(0.55, 0.18, 16, 64),
  new THREE.MeshStandardMaterial({ color: 0xf472b6 })
);
aboutMesh.name = 'About';
aboutMesh.position.set(1.8, 0, 0);
aboutMesh.castShadow = true;
aboutMesh.receiveShadow = true;
roomGroup.add(aboutMesh);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const interactiveMeshes = [workMesh, contactMesh, aboutMesh];
let hoveredMesh = null;

const infoPanel = document.getElementById('info-panel');
const meshDescriptions = {
  Work: 'Blue Nigger',
  Contact: 'Green Nigger',
  About: 'Red Nigger'
};

function showInfoForMesh(mesh) {
  infoPanel.textContent = meshDescriptions[mesh.name] ?? `${mesh.name}: Interactive section`;
  infoPanel.classList.remove('is-hidden');
}

function hideInfoPanel() {
  infoPanel.classList.add('is-hidden');
}

function updatePointerPosition(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
}

function resetHoveredMesh() {
  if (!hoveredMesh) {
    return;
  }

  hoveredMesh.scale.set(1, 1, 1);
  hoveredMesh = null;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointerPosition(event);

  raycaster.setFromCamera(mouse, camera);
  const intersections = raycaster.intersectObjects(interactiveMeshes, false);
  const nextHovered = intersections[0]?.object ?? null;

  document.body.style.cursor = nextHovered ? 'pointer' : 'default';

  if (hoveredMesh && hoveredMesh !== nextHovered) {
    resetHoveredMesh();
  }

  if (nextHovered && nextHovered !== hoveredMesh) {
    hoveredMesh = nextHovered;
    hoveredMesh.scale.set(1.05, 1.05, 1.05);
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  resetHoveredMesh();
  document.body.style.cursor = 'default';
});

renderer.domElement.addEventListener('click', (event) => {
  updatePointerPosition(event);

  raycaster.setFromCamera(mouse, camera);
  const intersections = raycaster.intersectObjects(interactiveMeshes, false);

  if (intersections.length > 0) {
    const clickedMesh = intersections[0].object;
    showInfoForMesh(clickedMesh);
    gsap.to(camera.position, {
      duration: 0.9,
      x: clickedMesh.position.x,
      y: clickedMesh.position.y + 0.9,
      z: clickedMesh.position.z + 2,
      ease: 'power2.out',
      onUpdate: () => {
        camera.lookAt(clickedMesh.position);
      }
    });

    gsap.to(controls.target, {
      duration: 0.9,
      x: clickedMesh.position.x,
      y: clickedMesh.position.y,
      z: clickedMesh.position.z,
      ease: 'power2.out'
    });

    return;
  }

  hideInfoPanel();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
