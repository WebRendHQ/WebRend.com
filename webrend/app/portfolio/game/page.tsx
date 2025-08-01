'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
// import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, useBox, usePlane } from '@react-three/cannon';
import { PointerLockControls, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import styles from './game.module.scss';
import { auth } from '../../lib/firebase-client';
import { onAuthStateChanged } from 'firebase/auth';

// Dynamically import nipplejs for the virtual joystick
const Joystick = dynamic(() => import('./components/Joystick'), { 
  ssr: false 
});

// Custom hook to detect mobile devices
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);
  
  return isMobile;
};

// Define JoystickData interface
interface JoystickData {
  forward: number;
  right: number;
}

// Define Player interface for multiplayer
interface Player {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
  username: string;
  lastUpdated: number;
  isActive?: boolean;
}

// Custom hook for player data updates and polling
function usePlayerSync(userId: string, username: string) {
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [playerCount, setPlayerCount] = useState<number>(0);
  const playerDataRef = useRef<{
    position: [number, number, number];
    rotation: [number, number, number, number];
  }>({
    position: [0, 2, 0],
    rotation: [0, 0, 0, 1]
  });
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const updateIntervalMs = 100; // Update position every 100ms

  // Create player record initially
  useEffect(() => {
    if (!userId) return;
    
    // Create or update player data
    const createPlayerRecord = async () => {
      try {
        await fetch('/api/game/players', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: userId,
            position: [0, 2, 0],
            rotation: [0, 0, 0, 1],
            username: username || 'Guest',
            lastUpdated: Date.now(),
            isActive: true
          })
        });
      } catch (error) {
        console.error('Error creating player record:', error);
      }
    };
    
    createPlayerRecord();
    
    // Clean up player data on unmount
    return () => {
      fetch(`/api/game/players?id=${userId}`, {
        method: 'DELETE'
      }).catch(error => {
        console.error('Error removing player:', error);
      });
    };
  }, [userId, username]);
  
  // Start polling for player updates
  useEffect(() => {
    if (!userId) return;
    
    const pollForPlayers = async () => {
      try {
        const response = await fetch('/api/game/players');
        
        if (response.ok) {
          const data = await response.json();
          const timeThreshold = Date.now() - 30000; // 30 seconds inactive threshold
          
          // Filter out inactive players and self
          const activePlayers = data.players.filter((player: Player) => 
            player.id !== userId && 
            player.lastUpdated > timeThreshold &&
            player.isActive !== false
          );
          
          setOtherPlayers(activePlayers);
          setPlayerCount(activePlayers.length + 1); // Include self
        }
      } catch (error) {
        console.error('Error fetching players:', error);
      }
    };
    
    // Poll immediately and then set up interval
    pollForPlayers();
    pollIntervalRef.current = setInterval(pollForPlayers, 2000); // Poll every 2 seconds
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [userId]);
  
  // Function to update player data
  const updatePlayerData = async (position: [number, number, number], rotation: [number, number, number, number]) => {
    if (!userId) return;
    
    playerDataRef.current = { position, rotation };
    
    const now = Date.now();
    if (now - lastUpdateTimeRef.current > updateIntervalMs) {
      lastUpdateTimeRef.current = now;
      
      try {
        await fetch('/api/game/players', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: userId,
            position,
            rotation,
            username,
            lastUpdated: now,
            isActive: true
          })
        });
      } catch (error) {
        console.error('Error updating player position:', error);
      }
    }
  };
  
  return { otherPlayers, playerCount, updatePlayerData };
}

// Wall component - UNUSED
// function Wall({ position, rotation = [0, 0, 0], size = [20, 5, 0.5], color = "#ffffff" }: { 
//   position: [number, number, number]; 
//   rotation?: [number, number, number]; 
//   size?: [number, number, number]; 
//   color?: string;
// }) {
//   const [ref] = useBox(() => ({ 
//     position,
//     rotation,
//     args: size,
//     type: 'Static' as const,
//     friction: 0.3,
//     restitution: 0.1
//   }));
//   
//   return (
//     <mesh ref={ref} castShadow receiveShadow>
//       <boxGeometry args={size} />
//       <meshStandardMaterial color={color} />
//     </mesh>
//   );
// }

// Floor component - keep for physics collision
function Floor(props: { position: [number, number, number] }) {
  const [ref] = usePlane(() => ({ 
    rotation: [-Math.PI / 2, 0, 0],
    position: props.position,
    type: 'Static',
    friction: 0.2,
    restitution: 0.1
  }));
  
  return (
    <mesh ref={ref} receiveShadow visible={false}>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#f0f0f0" />
    </mesh>
  );
}

// Ceiling component - UNUSED
// function Ceiling(props: { position: [number, number, number] }) {
//   const [ref] = usePlane(() => ({ 
//     rotation: [Math.PI / 2, 0, 0],
//     position: props.position,
//     type: 'Static',
//     friction: 0.2,
//     restitution: 0.1
//   }));
//   
//   return (
//     <mesh ref={ref} receiveShadow>
//       <planeGeometry args={[100, 100]} />
//       <meshStandardMaterial color="#f0f0f0" />
//     </mesh>
//   );
// }

// Box component - UNUSED
// function Box({ position }: { position: [number, number, number] }) {
//   const [ref] = useBox(() => ({ 
//     mass: 10,
//     position,
//     args: [1, 1, 1] as [number, number, number],
//     type: 'Dynamic' as const,
//     friction: 0.3,
//     restitution: 0.2,
//     linearDamping: 0.4,
//     angularDamping: 0.4
//   }));
//   
//   return (
//     <mesh ref={ref} castShadow>
//       <boxGeometry args={[1, 1, 1]} />
//       <meshStandardMaterial color="#ff4040" />
//     </mesh>
//   );
// }

// Other Player component (renders other players in the game)
function OtherPlayer({ player }: { player: Player }) {
  return (
    <group position={player.position}>
      {/* Player model */}
      <mesh castShadow>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="#4287f5" />
      </mesh>
      
      {/* Username floating above player */}
      <Text
        position={[0, 2.5, 0]}
        color="white"
        fontSize={0.5}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {player.username}
      </Text>
    </group>
  );
}

// Player (camera) controls with network synchronization
function FirstPersonControls({ joystickData, updatePlayerData }: { 
  joystickData: JoystickData;
  updatePlayerData: (position: [number, number, number], rotation: [number, number, number, number]) => void;
}) {
  const { camera } = useThree();
  const [ref, api] = useBox(() => ({
    mass: 75, // Average human mass
    position: [0, 2, 0],
    args: [1, 2, 1] as [number, number, number],
    type: 'Dynamic' as const,
    fixedRotation: true,
    linearDamping: 0.5 // Less damping for more natural movement
  }));
  
  const velocity = useRef<THREE.Vector3>(new THREE.Vector3());
  const position = useRef<[number, number, number]>([0, 0, 0]);
  const isSprinting = useRef<boolean>(false);
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false
  });
  
  useEffect(() => {
    api.position.subscribe((p) => {
      position.current = p;
    });
    
    api.velocity.subscribe((v) => {
      velocity.current.set(v[0], v[1], v[2]);
    });
  }, [api.position, api.velocity]);
  
  useFrame(() => {
    camera.position.set(position.current[0], position.current[1], position.current[2]);
    
    const direction = new THREE.Vector3();
    
    // Scale joystick input for better mobile control
    const joyForward = joystickData.forward * 3 || 0;
    const joyRight = joystickData.right * 3 || 0;
    
    // Combine keyboard and joystick inputs
    const keyboardForward = keys.current.forward ? 1 : keys.current.backward ? -1 : 0;
    const keyboardRight = keys.current.right ? 1 : keys.current.left ? -1 : 0;
    
    // Use either keyboard or joystick, prioritizing keyboard
    const moveForward = keyboardForward !== 0 ? keyboardForward : joyForward;
    const moveRight = keyboardRight !== 0 ? keyboardRight : joyRight;
    
    const frontVector = new THREE.Vector3(
      0,
      0,
      moveForward * -1
    );
    const sideVector = new THREE.Vector3(
      moveRight,
      0,
      0
    );
    
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(isSprinting.current ? 35 : 25)
      .applyEuler(camera.rotation);
    
    // Keep vertical velocity (for gravity/jumping) but update horizontal movement
    api.velocity.set(direction.x, velocity.current.y, direction.z);
    
    // Get camera quaternion and update player data
    const quaternion = new THREE.Quaternion();
    camera.getWorldQuaternion(quaternion);
    
    updatePlayerData(
      position.current,
      [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
    );
  });
  
  // Jump function
  const jump = useCallback(() => {
    // Only jump if close to the ground to prevent air jumping
    if (Math.abs(velocity.current.y) < 0.5) {
      api.velocity.set(velocity.current.x, 8, velocity.current.z);
    }
  }, [api]);
  
  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keys.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.right = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keys.current.left = true;
          break;
        case 'Space':
          jump();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          isSprinting.current = true;
          break;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keys.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.right = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keys.current.left = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          isSprinting.current = false;
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [jump]);
  
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial transparent opacity={0} />
    </mesh>
  );
}

// Gallery Model Component
function GalleryModel() {
  const { scene } = useGLTF('/game/vr-art-gallery.glb');
  
  useEffect(() => {
    // Set materials and shadows for imported model
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}

// Main Scene component
function Scene({ joystickData, otherPlayers, updatePlayerData }: {
  joystickData: JoystickData; 
  otherPlayers: Player[];
  updatePlayerData: (position: [number, number, number], rotation: [number, number, number, number]) => void;
}) {
  // const isMobile = useIsMobile();
  const [pointerLockControls, setPointerLockControls] = useState<any>(null);
  
  // Handle pointer lock errors
  useEffect(() => {
    if (!pointerLockControls) return;
    
    const handlePointerLockError = () => {
      console.warn('Pointer Lock API Error - Make sure you click the game canvas first');
    };
    
    // Listen for pointer lock errors
    document.addEventListener('pointerlockerror', handlePointerLockError);
    
    return () => {
      document.removeEventListener('pointerlockerror', handlePointerLockError);
    };
  }, [pointerLockControls]);
  
  // Preload the GLB model
  useGLTF.preload('/game/vr-art-gallery.glb');
  
  return (
    <Canvas 
      shadows 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      camera={{ position: [0, 2, 0], fov: 75 }}
      gl={{ preserveDrawingBuffer: true, alpha: true }}
    >
      <color attach="background" args={['#111']} />
      <fog attach="fog" args={['#111', 20, 50]} />
      <ambientLight intensity={0.5} />
      
      {/* Main directional light - coming from above */}
      <directionalLight
        position={[0, 15, 0]}
        intensity={0.7}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      
      {/* Secondary lights for better corners */}
      <pointLight position={[20, 2, 20]} intensity={0.8} castShadow distance={15} decay={2} />
      <pointLight position={[-20, 2, -20]} intensity={0.8} castShadow distance={15} decay={2} />
      <pointLight position={[20, 2, -20]} intensity={0.8} castShadow distance={15} decay={2} />
      <pointLight position={[-20, 2, 20]} intensity={0.8} castShadow distance={15} decay={2} />
      
      <Physics gravity={[0, -9.8, 0]}>
        <FirstPersonControls 
          joystickData={joystickData}
          updatePlayerData={updatePlayerData}
        />
        
        {/* Invisible floor for physics */}
        <Floor position={[0, 0, 0]} />
        
        {/* Import the GLB gallery model */}
        <GalleryModel />

        {/* Render other players */}
        {otherPlayers.map(player => (
          <OtherPlayer key={player.id} player={player} />
        ))}
      </Physics>
      
      <PointerLockControls ref={setPointerLockControls} />
    </Canvas>
  );
}

// Modified GamePage for embedding in portfolio
export default function GamePage() {
  const [joystickData, setJoystickData] = useState<JoystickData>({ forward: 0, right: 0 });
  const isMobile = useIsMobile();
  const [showInstructions, setShowInstructions] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [username, setUsername] = useState<string>('Guest');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Handle joystick movement
  const handleJoystickMove = (data: JoystickData) => {
    setJoystickData(data);
  };
  
  // Hide instructions after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowInstructions(false);
    }, 10000);
    
    return () => clearTimeout(timer);
  }, []);

  // Add click handler to start game
  const handleStartGame = () => {
    setGameStarted(true);
  };
  
  // Prevent pointer lock from causing issues with parent page
  useEffect(() => {
    // Release pointer lock when user presses escape or clicks away
    const handlePointerLockChange = () => {
      if (document.pointerLockElement === null && gameStarted) {
        // Add a small delay before allowing interactions with parent page
        setTimeout(() => {
          console.log("Pointer lock released");
        }, 100);
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [gameStarted]);
  
  // Check authentication status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setIsAuthenticated(true);
        
        // Get username from user profile
        if (user.displayName) {
          setUsername(user.displayName);
        } else if (user.email) {
          // Use email username as fallback
          setUsername(user.email.split('@')[0]);
        }
        
        // Try to get username from localStorage (may have been set in profile page)
        const storedUsername = localStorage.getItem('sellerUsername');
        if (storedUsername) {
          setUsername(storedUsername);
        }
      } else {
        // Generate a random guest ID if not authenticated
        setUserId(`guest-${Math.random().toString(36).substring(2, 9)}`);
        setUsername(`Guest-${Math.floor(Math.random() * 1000)}`);
        setIsAuthenticated(false);
      }
    });
    
    return () => unsubscribe();
  }, []);
  
  // Use the player synchronization hook
  const { otherPlayers, updatePlayerData } = usePlayerSync(userId, username);
  
  return (
    <div className={styles.embeddedGameContainer} ref={containerRef}>
      {!gameStarted ? (
        <div className={styles.startScreen} onClick={handleStartGame}>
          <div className={styles.startPrompt}>
            <h2>Click to Enter Gallery</h2>
            <p>Press ESC to exit the game mode</p>
          </div>
        </div>
      ) : (
        <>
          {showInstructions && (
            <div className={styles.embedInstructions}>
              <p><strong>Controls:</strong> WASD - Move | Mouse - Look | Space - Jump | ESC - Exit</p>
            </div>
          )}
          
          <div className={styles.gameContent}>
            <Scene 
              joystickData={joystickData}
              otherPlayers={otherPlayers}
              updatePlayerData={updatePlayerData}
            />
          </div>
          
          {isMobile && (
            <Joystick onMove={handleJoystickMove} />
          )}
        </>
      )}
    </div>
  );
} 