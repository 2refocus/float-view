import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RowKey } from '../../lib/parse/types';
import type { CreateRenderer, SendProgressUpdate } from './types';
import boardGlbUrl from '../../assets/board.glb?url';

interface TextElement {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom';
}

function createReusableTextTexture(
  canvasWidth: number,
  canvasHeight: number,
  defaultFontSize: number = 32,
  defaultColor: string = '#ffffff',
): {
  texture: THREE.Texture;
  updateText: (elements: TextElement[]) => void;
} {
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);

  // Set texture properties for proper rendering
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const updateText = (elements: TextElement[]) => {
    // Clear canvas with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save the current context state
    ctx.save();

    // Flip the canvas vertically to fix upside-down text
    ctx.scale(1, -1);
    ctx.translate(0, -canvas.height);

    // Draw each text element
    elements.forEach((element) => {
      const fontSize = element.fontSize ?? defaultFontSize;
      const color = element.color ?? defaultColor;
      const align = element.align ?? 'left';
      const baseline = element.baseline ?? 'top';

      // Set text properties
      ctx.font = `${fontSize}px Arial, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = baseline;

      // Now we can use the original Y coordinate since we've flipped the canvas
      ctx.fillText(element.text, element.x, element.y);
    });

    // Restore the context state
    ctx.restore();

    // Mark texture as needing update
    texture.needsUpdate = true;
  };

  return { texture, updateText };
}

function textureTreads(size: number = 512, lineWidth: number = 4, spacing: number = 28): THREE.Texture {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0a0a0a';
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

        // Apply crosshatch texture to all parts with "Wheel" in their names
        _boardModel.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;

          if (child.name.includes('Wheel')) {
            // child.material = new THREE.MeshBasicMaterial({ color: '#222' });
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

// TODO: move board into position
// TODO: footpad visualisation
// TODO: setpoints
// TODO: speed/duty
// TODO: temperature/current/voltage stats
// TODO: version
export const create3dRenderer: CreateRenderer = async (canvas, { showRemoteTilt }, sendProgressUpdate) => {
  //
  // Load models and setup scene
  //

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2c3e50); // Dark blue-gray background
  const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas });

  const light = new THREE.HemisphereLight('#b1e1ff', '#b97a20', 1.0);
  scene.add(light);

  const dirLight = new THREE.DirectionalLight('#ffffff', 0.75);
  dirLight.position.set(1, 1, 1);
  scene.add(dirLight);

  // board mesh - load asynchronously but store reference;
  const { boardModel } = await loadModels(sendProgressUpdate);

  // Create a container for the board model to handle centering
  const boardContainer = new THREE.Group();
  scene.add(boardContainer);

  // Calculate the bounding box to center the model properly
  const boundingBox = new THREE.Box3().setFromObject(boardModel);
  const center = boundingBox.getCenter(new THREE.Vector3());

  // Position the model within the container so its geometric center is at the container's origin
  boardModel.position.set(-center.x, -center.y, -center.z);
  boardContainer.add(boardModel);

  // Now you can position the boardContainer anywhere and it will move about its center
  boardContainer.position.set(0, 0, 0);

  // Position camera at an angle to see both pitch and roll rotations clearly
  camera.position.set(4, 2, 5);
  camera.lookAt(0, 0, 0);

  //
  // Setup orthographic camera for text overlay
  //

  const textScene = new THREE.Scene();
  const textCamera = new THREE.OrthographicCamera(0, canvas.width, canvas.height, 0, -1, 1);
  const { texture: textTexture, updateText } = createReusableTextTexture(canvas.width, canvas.height);
  {
    // Create a plane geometry that covers the entire screen
    const textGeometry = new THREE.PlaneGeometry(canvas.width, canvas.height);
    const textMaterial = new THREE.MeshBasicMaterial({
      map: textTexture,
      transparent: true,
      depthTest: false, // Always render on top
      depthWrite: false, // Don't write to depth buffer
    });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);

    // Position the UI plane
    textMesh.position.set(canvas.width / 2, canvas.height / 2, 0);
    textScene.add(textMesh);
  }
  renderer.autoClear = false;

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
        updateText([
          // Title in top-left
          { text: 'Float View 3D', x: 50, y: 50, fontSize: 32, color: '#ffffff', align: 'left', baseline: 'top' },
          // Pitch and Roll in top-right
          {
            text: `Pitch: ${data[RowKey.TruePitch].toFixed(1)}°`,
            x: canvas.width - 50,
            y: 50,
            fontSize: 24,
            color: '#00ff00',
            align: 'right',
            baseline: 'top',
          },
          {
            text: `Roll: ${data[RowKey.Roll].toFixed(1)}°`,
            x: canvas.width - 50,
            y: 90,
            fontSize: 24,
            color: '#0080ff',
            align: 'right',
            baseline: 'top',
          },
          // Version in bottom middle
          {
            text: import.meta.env.VITE_BUILD_VERSION,
            x: canvas.width / 2,
            y: canvas.height - 50,
            fontSize: 32,
            color: '#555',
            align: 'center',
            baseline: 'bottom',
          },
        ]);
      }

      // render main scene
      renderer.clear();
      renderer.render(scene, camera);
      // render text scene on top
      renderer.render(textScene, textCamera);

      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
  };
};
