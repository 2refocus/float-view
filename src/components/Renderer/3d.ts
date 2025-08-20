import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { RowKey, type RowWithIndex } from '../../lib/parse/types';
import type { CreateRenderer, RendererOptions, SendProgressUpdate } from './types';
import boardGlbUrl from '../../assets/board.glb?url';
import { draw2d } from './2d';

const isWorker = typeof importScripts === 'function';

function create2dTexture(
  canvasWidth: number,
  canvasHeight: number,
  options: RendererOptions,
): {
  texture: THREE.Texture;
  redraw: (data: RowWithIndex) => void;
} {
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);

  // HTML canvas' origin is top-left, but three.js uses WebGL whose origin is bottom-left.
  texture.flipY = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const redraw = (data: RowWithIndex) => {
    draw2d({
      canvas,
      ctx,
      data,
      drawBoard: false,
      drawBackground: false,
      drawRemoteTilt: options.drawRemoteTilt,
      images: options.images,
    });
    texture.needsUpdate = true;
  };

  return { texture, redraw };
}

function textureTreads(size: number = 512, lineWidth: number = 4, spacing: number = 28): THREE.Texture {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#303030';
  ctx.fillRect(0, 0, size, size);

  const h = size / 2;

  // Set up line style
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  // Draw horizontal lines for center treads
  const lines = [0.2, 0.4, 0.6, 0.8];
  ctx.beginPath();
  lines.forEach((line) => {
    ctx.moveTo(0, h + h * line);
    ctx.lineTo(size, h + h * line);
  });
  ctx.stroke();

  // Draw diagonal lines going from top-left to bottom-right
  ctx.strokeStyle = '#000000';
  for (let i = -size; i <= size; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, h);
    ctx.lineTo(i + size, h + size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(1, 1);

  return texture;
}

let _boardModel: THREE.Group | null = null;
function loadModels(sendProgressUpdate: SendProgressUpdate) {
  if (_boardModel) {
    return Promise.resolve({ boardModel: _boardModel.clone() });
  }

  sendProgressUpdate(0.1, 'Loading board model');
  console.time('loadBoardModel');
  const loader = new GLTFLoader();
  return new Promise<{ boardModel: THREE.Group }>((resolve, reject) => {
    loader.load(
      boardGlbUrl,
      (gltf) => {
        _boardModel = gltf.scene;

        // Log all the parts of the model to see what's available
        console.debug('Board model parts:');
        _boardModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            console.debug('- Mesh name:', child.name);
          }
        });

        _boardModel.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;

          if (child.name.includes('Wheel')) {
            child.material = new THREE.MeshPhongMaterial({ map: textureTreads() });
          }

          if (child.name.includes('Footpad')) {
            child.material = new THREE.MeshPhongMaterial({ color: '#78350f' });
          }

          if (child.name.includes('Box')) {
            child.material = new THREE.MeshPhongMaterial({ color: '#555' });
          }

          if (child.name.includes('Rail')) {
            child.material = new THREE.MeshPhongMaterial({ color: '#888' });
          }

          if (!child.name.includes('Wheel')) {
            child.add(
              new THREE.LineSegments(
                new THREE.EdgesGeometry(child.geometry),
                new THREE.LineBasicMaterial({ color: '#000' }),
              ),
            );
          }
        });

        resolve({ boardModel: _boardModel.clone() });
        console.timeEnd('loadBoardModel');
      },
      (progress) => {
        // TODO: send progress to ui thread
        // console.log('Loading progress:', progress);
      },
      (error) => {
        console.error('Error loading board model:', error);
        reject(error);
      },
    );
  });
}

export const create3dRenderer: CreateRenderer = async (canvas, options, sendProgressUpdate) => {
  //
  // Setup scene
  //

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1e293b');
  const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.autoClear = false;

  // TODO: support different board positions for render (side on, etc)
  camera.position.set(0, 0, 10);
  const lookTarget = new THREE.Vector3(2.75, 0, 0);
  camera.lookAt(lookTarget);

  if (!isWorker) {
    const controls = new OrbitControls(camera, canvas as HTMLCanvasElement);
    controls.target.copy(lookTarget);
    controls.update();
  }

  scene.add(new THREE.AmbientLight('#b1e1ff', 0.5));
  scene.add(new THREE.HemisphereLight('#b1e1ff', '#b97a20', 1.0));

  const dirLight = new THREE.DirectionalLight('#ffffff', 0.8);
  dirLight.position.set(1, 1, 1);
  scene.add(dirLight);

  //
  // Models
  //

  // Create a container for the board model to handle centering
  const boardContainer = new THREE.Group();
  scene.add(boardContainer);

  // Calculate the bounding box to center the model properly
  const { boardModel } = await loadModels(sendProgressUpdate);
  const boundingBox = new THREE.Box3().setFromObject(boardModel);
  const center = boundingBox.getCenter(new THREE.Vector3());

  // Position the model within the container so its geometric center is at the container's origin
  boardModel.position.set(-center.x, -center.y, -center.z);
  boardContainer.add(boardModel);
  boardContainer.position.set(0, 0, 0);

  //
  // Setup orthographic camera for UI overlays
  //

  const uiScene = new THREE.Scene();
  const uiCamera = new THREE.OrthographicCamera(0, canvas.width, canvas.height, 0, -1, 1);

  const { texture: speedGaugeTexture, redraw } = create2dTexture(canvas.width, canvas.height, options);
  {
    // Create a plane geometry that covers the entire screen
    const gaugeGeometry = new THREE.PlaneGeometry(canvas.width, canvas.height);
    const gaugeMaterial = new THREE.MeshBasicMaterial({
      map: speedGaugeTexture,
      transparent: true,
      depthTest: false, // Always render on top
      depthWrite: false, // Don't write to depth buffer
    });
    const gaugeMesh = new THREE.Mesh(gaugeGeometry, gaugeMaterial);

    // Position the UI plane
    gaugeMesh.position.set(canvas.width / 2, canvas.height / 2, 0);
    uiScene.add(gaugeMesh);
  }

  //
  // Renderer
  //

  return {
    close: () => {
      renderer.dispose();
      renderer.forceContextLoss();
    },
    draw: async (data) => {
      {
        const pitchRadians = THREE.MathUtils.degToRad(data[RowKey.TruePitch]);
        const rollRadians = THREE.MathUtils.degToRad(data[RowKey.Roll]);

        // Apply pitch and roll rotations using quaternions to avoid gimbal lock
        const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollRadians);
        const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchRadians);

        // Combine the rotations: apply pitch first, then roll
        const combinedQuaternion = new THREE.Quaternion().multiplyQuaternions(rollQuaternion, pitchQuaternion);

        boardContainer.quaternion.copy(combinedQuaternion);
      }

      {
        redraw(data);
      }

      // render main scene
      renderer.clear();
      renderer.render(scene, camera);
      // render text scene on top
      renderer.render(uiScene, uiCamera);

      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
  };
};
