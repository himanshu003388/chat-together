import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function Particles({ count = 2000, mouse, pulse }) {
  const mesh = useRef<THREE.Points>(null);
  const { size, viewport } = useThree();
  const aspect = size.width / viewport.width;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -50 + Math.random() * 100;
      const zFactor = -50 + Math.random() * 100;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  const points = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 50;
      p[i * 3 + 1] = (Math.random() - 0.5) * 50;
      p[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    return p;
  }, [count]);

  const [shockwave, setShockwave] = useState(0);

  useEffect(() => {
    if (pulse) {
      setShockwave(1);
      const timer = setTimeout(() => setShockwave(0), 1000);
      return () => clearTimeout(timer);
    }
  }, [pulse]);

  useFrame((state) => {
    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      const s = Math.cos(t);
      
      // Mouse interaction
      particle.mx += (mouse.current[0] - particle.mx) * 0.01;
      particle.my += (mouse.current[1] - particle.my) * 0.01;

      const x = (xFactor + Math.cos(t) * factor) + (particle.mx / 10);
      const y = (yFactor + Math.sin(t) * factor) + (particle.my / 10);
      const z = (zFactor + Math.cos(t) * factor);

      mesh.current!.geometry.attributes.position.setXYZ(
        i,
        x / 20,
        y / 20,
        z / 20
      );
    });
    
    mesh.current!.geometry.attributes.position.needsUpdate = true;
    mesh.current!.rotation.y += 0.001;
    
    if (shockwave > 0) {
       mesh.current!.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 10) * 0.05);
    } else {
       mesh.current!.scale.setScalar(1);
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length / 3}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#00d4ff"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function ThreeBackground({ pulse }: { pulse?: boolean }) {
  const mouse = useRef([0, 0]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
      <Canvas
        camera={{ position: [0, 0, 20], fov: 75 }}
        onMouseMove={(e) => (mouse.current = [e.clientX - window.innerWidth / 2, e.clientY - window.innerHeight / 2])}
      >
        <ambientLight intensity={0.5} />
        <Particles mouse={mouse} pulse={pulse} />
      </Canvas>
    </div>
  );
}
