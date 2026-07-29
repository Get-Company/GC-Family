"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uDark;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float wave(vec2 point, float offset) {
    return sin(point.x * 2.2 + offset) * 0.5
      + sin(point.y * 2.7 - offset * 0.82) * 0.35
      + sin((point.x + point.y) * 1.6 + offset * 0.45) * 0.2;
  }

  void main() {
    vec2 point = vUv - 0.5;
    point.x *= uResolution.x / uResolution.y;
    float flow = wave(point * 2.0, uTime * 0.22);
    float glowOne = smoothstep(1.18, 0.12, length(point - vec2(-0.42, 0.16 + flow * 0.05)));
    float glowTwo = smoothstep(1.0, 0.08, length(point - vec2(0.38, -0.23 - flow * 0.06)));

    vec3 lightBase = vec3(0.93, 0.97, 1.0);
    vec3 lightBlue = vec3(0.40, 0.66, 1.0);
    vec3 lightMint = vec3(0.28, 0.88, 0.72);
    vec3 darkBase = vec3(0.025, 0.045, 0.11);
    vec3 darkBlue = vec3(0.08, 0.24, 0.53);
    vec3 darkMint = vec3(0.03, 0.39, 0.35);

    vec3 base = mix(lightBase, darkBase, uDark);
    vec3 blue = mix(lightBlue, darkBlue, uDark);
    vec3 mint = mix(lightMint, darkMint, uDark);
    vec3 color = base + blue * (glowOne * 0.52) + mint * (glowTwo * 0.42);
    color += mix(vec3(0.035), vec3(0.012), uDark) * sin((point.x - point.y) * 18.0 + uTime * 0.16);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function AnimatedShaderBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const uniforms = {
      uTime: { value: 0 },
      uDark: { value: document.documentElement.dataset.theme === "dark" ? 1 : 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    function resize() {
      const { width, height } = host!.getBoundingClientRect();
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    }

    function syncTheme() {
      uniforms.uDark.value = document.documentElement.dataset.theme === "dark" ? 1 : 0;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    let frame = 0;
    function render(now: number) {
      uniforms.uTime.value = reduceMotion ? 0 : (now - startedAt) / 1000;
      renderer.render(scene, camera);
      if (!reduceMotion) frame = window.requestAnimationFrame(render);
    }

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    render(performance.now());

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      observer.disconnect();
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="shader-background" />;
}
