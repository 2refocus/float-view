import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RowKey } from '../lib/parse/types';
import type { CreateRenderer } from './Renderer.types';

function createReusableTextTexture(
  fontSize: number,
  color: string,
): {
  texture: THREE.Texture;
  updateText: (text: string) => void;
} {
  const canvas = new OffscreenCanvas(256, 128);
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);

  const updateText = (text: string) => {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set text properties
    ctx.font = `${fontSize}px IosevkaTerm Nerd Font, monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add text to canvas
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Mark texture as needing update
    texture.needsUpdate = true;
  };

  return { texture, updateText };
}

function textureTreads(size: number = 256, lineWidth: number = 6, spacing: number = 48): THREE.Texture {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#040404';
  ctx.fillRect(0, 0, size, size);

  // Set up line style
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  // Draw diagonal lines going from top-left to bottom-right
  for (let i = -size; i <= size * 2; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // Draw diagonal lines going from top-right to bottom-left
  for (let i = 0; i <= size * 2; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - size, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.repeat.set(1, 1);

  return texture;
}

// FIXME: generate a proper UV mesh for the cylinder here
function generateUVMapping(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const positionAttribute = geometry.getAttribute('position');
  const positions = positionAttribute.array as Float32Array;
  const vertexCount = positions.length / 3;

  // Calculate bounding box for the mesh
  geometry.computeBoundingBox();
  const boundingBox = geometry.boundingBox;
  if (!boundingBox) {
    console.warn('Could not compute bounding box for mesh:', mesh.name);
    return;
  }

  const getAxisValue = (axis: 'x' | 'y' | 'z', index: number): number => {
    const vertexIndex = index * 3;
    switch (axis) {
      case 'x':
        return positions[vertexIndex] || 0;
      case 'y':
        return positions[vertexIndex + 1] || 0;
      case 'z':
        return positions[vertexIndex + 2] || 0;
    }
  };

  // Create UV coordinates
  const uvs = new Float32Array(vertexCount * 2);
  const uRange = { min: boundingBox.min.y, max: boundingBox.max.y };
  const vRange = { min: boundingBox.min.x, max: boundingBox.max.x };

  for (let i = 0; i < vertexCount; i++) {
    const u = (getAxisValue('y', i) - uRange.min) / (uRange.max - uRange.min);
    const v = (getAxisValue('x', i) - vRange.min) / (vRange.max - vRange.min);

    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  // Set the UV attribute
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.attributes.uv && (geometry.attributes.uv.needsUpdate = true);
}

let _boardModel: THREE.Group | null = null;
function loadModels() {
  if (_boardModel) {
    return Promise.resolve({ boardModel: _boardModel.clone() });
  }

  console.time('loadBoardModel');
  const loader = new GLTFLoader();
  return new Promise<{ boardModel: THREE.Group }>((resolve, reject) => {
    loader.load(
      '/float-view/src/assets/board.glb',
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

          switch (child.name) {
            case 'Wheel_1':
            case 'Wheel_5':
              child.material = new THREE.MeshBasicMaterial({ color: '#333' });
              return;
            case 'Wheel_3':
              generateUVMapping(child);
              const material = new THREE.MeshBasicMaterial({ map: textureTreads() });
              child.material = material;
              return;
            case 'Wheel_4':
            case 'Wheel_2':
              child.material = new THREE.MeshBasicMaterial({ color: '#222' });
              return;
          }

          if (child.name.includes('Footpad')) {
            child.material = new THREE.MeshBasicMaterial({ color: '#555' });
          }

          if (child.name.includes('Rail')) {
            child.material = new THREE.MeshBasicMaterial({ color: '#888' });
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2c3e50); // Dark blue-gray background
  const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas });

  // Add lighting for better visibility of the board model
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // stronger ambient light
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // stronger directional light
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Add another light from different angle
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight2.position.set(-5, 2, -5);
  scene.add(directionalLight2);

  // board mesh - load asynchronously but store reference
  sendProgressUpdate(0.1, 'Loading board model');
  const { boardModel } = await loadModels();

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
  camera.position.set(0.5, 0.3, 0.6);
  camera.lookAt(0, 0, 0);

  // Create reusable text texture system for dynamic updates
  const { texture: textTexture, updateText } = createReusableTextTexture(32, '#ffffff');
  const textMaterial = new THREE.SpriteMaterial({ map: textTexture });
  const textSprite = new THREE.Sprite(textMaterial);
  scene.add(textSprite);
  updateText('Hello World');

  return {
    close: () => {
      renderer.dispose();
      _boardModel = null;
    },
    draw: (data) => {
      // Convert degrees to radians and apply pitch and roll rotations
      const pitchRadians = THREE.MathUtils.degToRad(data[RowKey.TruePitch]);
      const rollRadians = THREE.MathUtils.degToRad(data[RowKey.Roll]);

      // Apply pitch and roll rotations using quaternions to avoid gimbal lock
      const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollRadians);
      const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchRadians);

      // Combine the rotations: apply pitch first, then roll
      const combinedQuaternion = new THREE.Quaternion().multiplyQuaternions(rollQuaternion, pitchQuaternion);

      // Set the absolute rotation (don't accumulate)
      boardContainer.quaternion.copy(combinedQuaternion);

      {
        const pitch = data[RowKey.TruePitch].toFixed(1);
        const roll = data[RowKey.Roll].toFixed(1);
        updateText(`P: ${pitch}° R: ${roll}°`);

        // Position text sprite in top right corner of viewport
        // Use a much simpler approach - position relative to camera with fixed offset
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        textSprite.position.copy(camera.position);
        textSprite.position.add(cameraDirection.multiplyScalar(1));
        textSprite.position.add(cameraDirection.add(new THREE.Vector3(0, 1, 0)));
      }

      renderer.render(scene, camera);
    },
  };
};
