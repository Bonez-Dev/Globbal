import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const EARTH_TEXTURE =
  "./assets/bonus/earth-blue-marble.jpg";
const BUMP_TEXTURE =
  "./assets/bonus/earth-topology.png";
const EARTH_TEXTURE_CDN =
  "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg";
const BUMP_TEXTURE_CDN =
  "https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png";

function latLngToVector3(lat, lng, radius) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

class GlobeDragControls {
  constructor(camera, domElement, pivot) {
    this.camera = camera;
    this.domElement = domElement;
    this.pivot = pivot;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.spinY = 0;
    this.spinX = 0;
    this.baseQuaternion = new THREE.Quaternion();

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    domElement.addEventListener("pointerdown", this.onPointerDown);
    domElement.addEventListener("pointermove", this.onPointerMove);
    domElement.addEventListener("pointerup", this.onPointerUp);
    domElement.addEventListener("pointerleave", this.onPointerUp);
    domElement.addEventListener("pointercancel", this.onPointerUp);
  }

  setBaseQuaternion(quaternion) {
    this.baseQuaternion.copy(quaternion);
    this.spinX = 0;
    this.spinY = 0;
    this.applyRotation();
  }

  applyRotation() {
    this.pivot.quaternion.copy(this.baseQuaternion);
    this.pivot.rotateY(this.spinY);
    this.pivot.rotateX(this.spinX);
  }

  onPointerDown(event) {
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.dragging) {
      return;
    }
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.spinY += dx * 0.005;
    this.spinX += dy * 0.005;
    this.spinX = Math.max(-1.2, Math.min(1.2, this.spinX));
    this.applyRotation();
  }

  onPointerUp(event) {
    this.dragging = false;
    this.domElement.releasePointerCapture?.(event.pointerId);
  }

  update() {
    /* drag is immediate */
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointerleave", this.onPointerUp);
    this.domElement.removeEventListener("pointercancel", this.onPointerUp);
  }
}

export class BonusGlobe {
  constructor(hostEl) {
    this._initPromise = this._init(hostEl);
  }

  async _init(hostEl) {
    this.hostEl = hostEl;
    this.markers = [];
    this.raf = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    if (!this.renderer.getContext()) {
      throw new Error("WebGL is not available in this browser.");
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.hostEl.replaceChildren(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 2.8);
    this.camera.lookAt(0, 0, 0);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.controls = new GlobeDragControls(this.camera, this.renderer.domElement, this.pivot);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(4, 2, 5);
    this.scene.add(ambient, sun);

    const loader = new THREE.TextureLoader();
    const loadTexture = (localUrl, cdnUrl) =>
      new Promise((resolve, reject) => {
        loader.load(
          localUrl,
          resolve,
          undefined,
          () => {
            loader.load(cdnUrl, resolve, undefined, reject);
          }
        );
      });
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const [earthMap, bumpMap] = await Promise.all([
      loadTexture(EARTH_TEXTURE, EARTH_TEXTURE_CDN),
      loadTexture(BUMP_TEXTURE, BUMP_TEXTURE_CDN)
    ]);
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthMap,
      bumpMap,
      bumpScale: 0.025,
      specular: new THREE.Color(0x222222),
      shininess: 8
    });
    this.earth = new THREE.Mesh(earthGeo, earthMat);
    this.pivot.add(this.earth);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 14 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, sizeAttenuation: true })
    );
    this.scene.add(stars);

    this.onResize = this.onResize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.tick();
  }

  async ready() {
    await this._initPromise;
  }

  onResize() {
    const width = this.hostEl.clientWidth || this.hostEl.parentElement?.clientWidth || 320;
    const height = this.hostEl.clientHeight || this.hostEl.parentElement?.clientHeight || 320;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  tick() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  }

  clearMarkers() {
    this.markers.forEach((marker) => {
      this.earth.remove(marker);
      marker.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose?.());
          } else {
            obj.material.dispose?.();
          }
        }
      });
    });
    this.markers = [];
  }

  setTarget(lat, lng) {
    this.clearMarkers();
    const pos = latLngToVector3(lat, lng, 1.02);
    const normal = pos.clone().normalize();

    const pin = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x05070d })
    );
    base.position.copy(pos);
    pin.add(base);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x111827 })
    );
    stem.position.copy(pos.clone().add(normal.clone().multiplyScalar(0.05)));
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    pin.add(stem);

    this.earth.add(pin);
    this.markers.push(pin);

    const targetDir = latLngToVector3(lat, lng, 1).normalize();
    const faceCamera = new THREE.Quaternion().setFromUnitVectors(
      targetDir,
      new THREE.Vector3(0, 0, 1)
    );
    this.controls.setBaseQuaternion(faceCamera);
  }

  flashMarker(kind) {
    const color = kind === "correct" ? 0x3ddc84 : 0xff6b6b;
    this.markers.forEach((group) => {
      group.traverse((obj) => {
        if (obj.material?.emissive) {
          obj.material.emissive.setHex(color);
        }
      });
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
