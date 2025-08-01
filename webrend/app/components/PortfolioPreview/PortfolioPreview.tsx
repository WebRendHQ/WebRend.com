'use client';

import React, { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { useSpring, animated } from '@react-spring/three';
import styles from './PortfolioPreview.module.css';

// Match the interface from the portfolio system
interface PortfolioProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  imageUrl: string;
  tags: string[];
  projectUrl?: string;
  dateCompleted: Date;
  featured: boolean;
}

// Type for private repository location data
interface PrivateRepoLocationData {
  repoName: string;
  location: string;
  latitude: number;
  longitude: number;
  iconUrl?: string;
}

// Enhanced location type with repo information
interface EnhancedLocation {
  lat: number;
  lng: number;
  name: string;
  repoName: string;
  iconUrl?: string;
  isPrivate?: boolean;
}

interface PortfolioPreviewProps {
  projects: PortfolioProject[];
}

// Component for the Globe (copied from HeroSection)
function Globe({ locations, findMatchingProject }: { locations: EnhancedLocation[], findMatchingProject: (repoName: string) => PortfolioProject | null }) {
  const globeRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const [textureLoaded, setTextureLoaded] = useState(false);
  const [textureFailed, setTextureFailed] = useState(false);
  const [cloudsTextureLoaded, setCloudsTextureLoaded] = useState(false);
  const [specularTextureLoaded, setSpecularTextureLoaded] = useState(false);
  const [loadedIcons, setLoadedIcons] = useState<Record<string, THREE.Texture | null>>({});
  const [alarmColor, setAlarmColor] = useState<THREE.Color>(new THREE.Color("#FF0000"));
  const [alarmIntensity, setAlarmIntensity] = useState<number>(1.0);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  
  // State to track which icons are in the central view
  const [centeredIcons, setCenteredIcons] = useState<Record<number, number>>({});
  
  // State for hover effects
  const [hoveredIcon, setHoveredIcon] = useState<number | null>(null);
  const [isGlobeRotating, setIsGlobeRotating] = useState<boolean>(true);
  const orbitControlsRef = useRef<any>(null);
  const iconsRef = useRef<THREE.Group[]>([]);
  const globeGroupRef = useRef<THREE.Group>(null);
  
  // Direct access to the texture loader
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const dayTexturePath = '/earth-blue-marble.jpg';
  const nightTexturePath = '/earth-night.jpg';
  const cityLightsPath = '/earth-city-lights.jpg';
  const cloudsPath = '/earth-clouds.png';
  const specularPath = '/earth-specular.jpg';

  // Separate function to load globe textures
  const loadGlobeTextures = useCallback((isDark: boolean) => {
    console.log(`Loading ${isDark ? 'dark' : 'light'} mode textures...`);
    
    if (!globeRef.current) return;
    
    // Get the material
    const material = globeRef.current.material as THREE.MeshStandardMaterial;
    
    // Reset material properties
    if (material.map) material.map.dispose();
    if (material.displacementMap) material.displacementMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.emissiveMap) material.emissiveMap.dispose();
    if (material.roughnessMap) material.roughnessMap.dispose();
    if (material.metalnessMap) material.metalnessMap.dispose();
    
    // Load the main texture based on theme
    textureLoader.load(
      isDark ? nightTexturePath : dayTexturePath,
      (texture) => {
        console.log(`Main texture loaded: ${isDark ? 'night' : 'day'}`);
        if (!globeRef.current) return;
        
        const material = globeRef.current.material as THREE.MeshStandardMaterial;
        material.map = texture;
        
        // No tint in light mode, very slight tint in dark mode
        material.color.set(isDark ? 0x222222 : 0xffffff);
        material.needsUpdate = true;
        setTextureLoaded(true);
        
        // Load specular map for both modes
        textureLoader.load(
          specularPath,
          (specTexture) => {
            console.log('Specular texture loaded');
            if (!globeRef.current) return;
            
            const material = globeRef.current.material as THREE.MeshStandardMaterial;
            material.roughnessMap = specTexture;
            material.roughness = 0.6;
            material.metalnessMap = specTexture;
            material.metalness = 0.4;
            material.needsUpdate = true;
          }
        );
        
        // Handle emissive properties differently based on theme
        if (isDark) {
          // Dark mode gets city lights
          textureLoader.load(
            cityLightsPath,
            (lightsTexture) => {
              console.log('City lights loaded');
              if (!globeRef.current) return;
              
              const material = globeRef.current.material as THREE.MeshStandardMaterial;
              material.emissiveMap = lightsTexture;
              material.emissive.set(0xffcc77);
              material.emissiveIntensity = 0.8;
              material.needsUpdate = true;
            }
          );
        } else {
          // Light mode gets a subtle glow
          if (globeRef.current) {
            const material = globeRef.current.material as THREE.MeshStandardMaterial;
            material.emissive.set(0x113355);
            material.emissiveIntensity = 0.1;
            material.needsUpdate = true;
          }
        }
      },
      undefined,
      (error) => {
        console.error('Error loading main texture:', error);
        setTextureFailed(true);
      }
    );
    
    // Load clouds texture
    if (cloudsRef.current) {
      textureLoader.load(
        cloudsPath,
        (cloudsTexture) => {
          console.log('Clouds texture loaded');
          if (!cloudsRef.current) return;
          
          const cloudMaterial = cloudsRef.current.material as THREE.MeshStandardMaterial;
          cloudMaterial.map = cloudsTexture;
          cloudMaterial.transparent = true;
          cloudMaterial.opacity = 0.8;
          cloudMaterial.alphaTest = 0.1;
          cloudMaterial.blending = THREE.AdditiveBlending;
          cloudMaterial.depthWrite = false;
          cloudMaterial.needsUpdate = true;
          setCloudsTextureLoaded(true);
        }
      );
    }
  }, [textureLoader]);

  // This effect runs once on mount to load the correct texture based on theme
  useEffect(() => {
    // First-time setup for correct theme
    const isDark = document.documentElement.classList.contains('dark-theme');
    setIsDarkMode(isDark);
    loadGlobeTextures(isDark);
  }, [loadGlobeTextures]);

  // Check for dark mode on mount and theme changes
  useEffect(() => {
    // Helper function to check dark mode
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains('dark-theme');
      if (isDark !== isDarkMode) {
        console.log(`Dark mode updated: ${isDark}`);
        setIsDarkMode(isDark);
        
        // Force texture reload when theme changes
        loadGlobeTextures(isDark);
      }
    };
    
    // Check immediately on mount
    checkDarkMode();
    
    // Custom event handler for theme checking from parent component
    const handleThemeCheck = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Received theme-check event:', customEvent?.detail);
      checkDarkMode();
    };
    
    // Listen for our custom theme-check event
    document.documentElement.addEventListener('theme-check', handleThemeCheck);
    
    // Set up a MutationObserver to detect theme class changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkDarkMode();
        }
      });
    });
    
    // Observe document.documentElement for class changes
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });
    
    // Check on visibility changes (tab focus, etc.)
    document.addEventListener('visibilitychange', checkDarkMode);
    
    // Handle focus events when returning to the page
    window.addEventListener('focus', checkDarkMode);
    
    // Clean up
    return () => {
      document.removeEventListener('visibilitychange', checkDarkMode);
      window.removeEventListener('focus', checkDarkMode);
      document.documentElement.removeEventListener('theme-check', handleThemeCheck);
      observer.disconnect();
    };
  }, [isDarkMode, loadGlobeTextures]);
  
  // Spring animation for globe rotation slowdown
  const { rotationSpeedSpring } = useSpring({
    rotationSpeedSpring: isGlobeRotating ? 0.0004 : 0,
    config: { mass: 1, tension: 280, friction: 120 }
  });
  
  // Router for navigation
  const router = useRouter();
  
  // Function to create a slug from repo name
  const createSlug = (repoName: string): string => {
    return repoName.toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/--+/g, '-'); // Replace multiple hyphens with a single one
  };
  
  // Function to handle icon click
  const handleIconClick = (location: EnhancedLocation, index: number, event: any) => {
    // Prevent event from bubbling up to other icons or the globe
    event.stopPropagation();
    
    // Debug log to confirm which icon was clicked
    console.log(`Clicked icon ${index}: ${location.repoName} at ${location.name}`);
    
    // Create a slug directly from the repository name
    const repoSlug = createSlug(location.repoName);
    
    // Find the matching portfolio project for better user experience
    const matchingProject = findMatchingProject(location.repoName);
    
    if (matchingProject && matchingProject.slug) {
      console.log(`Found matching project: ${matchingProject.title} (${matchingProject.slug})`);
      console.log(`Navigating to project page with repo slug: ${repoSlug}`);
      // Navigate to the project page using the repo slug
      router.push(`/portfolio/projects/${repoSlug}`);
    } else {
      console.log(`No matching project found for ${location.repoName}`);
      // Show a confirmation before navigating to a non-existent project
      const shouldNavigate = confirm(
        `No portfolio case study found for "${location.repoName}". Would you like to view our portfolio page instead?`
      );
      
      if (shouldNavigate) {
        router.push('/portfolio');
      } else {
        // User chose not to navigate, try the project page anyway (will show 404)
        router.push(`/portfolio/projects/${repoSlug}`);
      }
    }
  };
  
  // Reset all hover states (used when clicking on empty space)
  const resetHoverStates = () => {
    if (hoveredIcon !== null) {
      setHoveredIcon(null);
      setIsGlobeRotating(true);
      document.body.style.cursor = 'auto';
    }
  };

  // Event handler for hover detection
  const handlePointerOver = (index: number, event: any) => {
    // Prevent propagation to other elements
    event.stopPropagation();
    
    // Only update if not already hovering on this icon
    if (hoveredIcon !== index) {
      setHoveredIcon(index);
      setIsGlobeRotating(false);
      document.body.style.cursor = 'pointer';
    }
  };
  
  // Event handler for hover end
  const handlePointerOut = (event: any) => {
    // Prevent propagation to other elements
    event.stopPropagation();
    
    setHoveredIcon(null);
    setIsGlobeRotating(true);
    document.body.style.cursor = 'auto';
  };
  
  // Update icon scales based on their position relative to camera
  useEffect(() => {
    const updateIconScales = () => {
      const newCenteredIcons: Record<number, number> = {};
      
      // For each location, calculate its distance from the center of the globe
      locations.forEach((location, index) => {
        const phi = (90 - location.lat) * (Math.PI / 180);
        const theta = (location.lng + 180) * (Math.PI / 180);
        
        // Calculate position
        const z = 3 * Math.sin(phi) * Math.sin(theta);
        
        // Determine if the point is visible in the current view
        // Front of the globe is more visible (has a larger z value)
        const visibilityFactor = z + 3; // Range roughly -3 to 3, higher means more visible

        // Convert to scale (0.7 to 1.2)
        const scale = 0.7 + (visibilityFactor / 6) * 0.5;
        
        newCenteredIcons[index] = Math.max(0.7, Math.min(1.2, scale));
      });
      
      setCenteredIcons(newCenteredIcons);
    };
    
    // Initial update
    updateIconScales();
    
    // Update scales every 100ms during rotation
    const interval = setInterval(updateIconScales, 100);
    
    return () => {
      clearInterval(interval);
    };
  }, [locations]);
  
  // Load icon textures for locations
  useEffect(() => {
    const textureLoader = new THREE.TextureLoader();
    const newLoadedIcons: Record<string, THREE.Texture | null> = {};
    
    // Load textures for all locations with icon URLs
    locations.forEach(location => {
      if (location.iconUrl) {
        // Check if iconUrl is a URL string (starts with http or /)
        if (typeof location.iconUrl === 'string' && 
            (location.iconUrl.startsWith('http') || location.iconUrl.startsWith('/'))) {
          textureLoader.load(
            location.iconUrl,
            (texture) => {
              newLoadedIcons[location.repoName] = texture;
              setLoadedIcons(prev => ({ ...prev, [location.repoName]: texture }));
            },
            undefined,
            (error) => {
              console.error(`Error loading icon for ${location.repoName}:`, error);
              newLoadedIcons[location.repoName] = null;
              setLoadedIcons(prev => ({ ...prev, [location.repoName]: null }));
            }
          );
        } else {
          // If it's just a string (like "W" or "C"), don't try to load it as a texture
          newLoadedIcons[location.repoName] = null;
          setLoadedIcons(prev => ({ ...prev, [location.repoName]: null }));
        }
      } else {
        newLoadedIcons[location.repoName] = null;
        setLoadedIcons(prev => ({ ...prev, [location.repoName]: null }));
      }
    });
    
    return () => {
      // Cleanup textures
      Object.values(newLoadedIcons).forEach(texture => {
        if (texture) texture.dispose();
      });
    };
  }, [locations]);

  // Slow rotation of the entire globe group with enhanced cloud animation and smooth slowdown
  useFrame(() => {
    if (globeGroupRef.current) {
      // Get current rotation speed from spring animation
      const currentSpeed = rotationSpeedSpring.get();
      
      // Rotate the globe at the current animated speed
      globeGroupRef.current.rotation.y += currentSpeed;
      
      // Add realistic counter-rotation for clouds
      if (cloudsRef.current) {
        // Clouds rotate in the opposite direction at a slightly slower relative speed
        cloudsRef.current.rotation.y -= currentSpeed * 0.75;
        
        // Keep uniform cloud properties instead of animating them
        const material = cloudsRef.current.material as THREE.MeshStandardMaterial;
        material.opacity = 0.8; // Fixed opacity
        material.emissiveIntensity = 0.05; // Fixed emission
      }
    }
  });
  
  // Effect to update OrbitControls autoRotate based on hover state
  useEffect(() => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.autoRotate = isGlobeRotating;
    }
  }, [isGlobeRotating]);
  
  // Alarm blinking effect with smooth fade
  useEffect(() => {
    let fadeTimer: number;
    const redColor = new THREE.Color("#FF0000");
    const blackColor = new THREE.Color("#000000");
    let targetColor = blackColor;
    let transitionProgress = 0;
    
    // Smoother color transition using requestAnimationFrame
    const updateColor = () => {
      // Increase transition progress
      transitionProgress += 0.01;
      
      if (transitionProgress >= 1) {
        // When transition completes, switch target color
        targetColor = targetColor.equals(blackColor) ? redColor : blackColor;
        transitionProgress = 0;
      }
      
      // Create a new color that's a mix between current and target
      const newColor = new THREE.Color().copy(
        targetColor.equals(blackColor) ? redColor : blackColor
      ).lerp(targetColor, transitionProgress);
      
      setAlarmColor(newColor);
      
      // Also update intensity for pulsating effect
      setAlarmIntensity(0.7 + Math.sin(transitionProgress * Math.PI) * 0.3);
      
      fadeTimer = requestAnimationFrame(updateColor);
    };
    
    fadeTimer = requestAnimationFrame(updateColor);
    
    return () => {
      cancelAnimationFrame(fadeTimer);
    };
  }, []);
  
  // Generate a color based on location name and whether it's private
  const getLocationColor = (location: EnhancedLocation) => {
    // Generate a deterministic but varied color based on the string
    const name = location.repoName;
    const hash = name.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    // Same color palette for all repos
    const colors = [
      '#007AFF', // iOS blue
      '#34C759', // iOS green
      '#FF9500', // iOS orange
      '#5AC8FA', // iOS light blue
      '#FFCC00', // iOS yellow
      '#FF2D55', // iOS pink
      '#AF52DE', // iOS purple
      '#5856D6'  // iOS indigo
    ];
    
    return colors[Math.abs(hash) % colors.length];
  };

  // Get the first letter or icon for the marker
  const getLocationIcon = (location: EnhancedLocation) => {
    // If iconUrl is a string that's not a URL, use that as the icon text
    if (typeof location.iconUrl === 'string' && 
        !(location.iconUrl.startsWith('http') || location.iconUrl.startsWith('/'))) {
      return location.iconUrl;
    }
    // Otherwise use the first letter of the repo name
    return location.repoName.charAt(0).toUpperCase();
  };
  
  // Create a rounded rectangle shape for iOS app icons
  const createRoundedRectShape = (width: number, height: number, radius: number) => {
    const shape = new THREE.Shape();
    
    // Starting at top-right corner
    shape.moveTo(width/2 - radius, -height/2);
    shape.lineTo(-width/2 + radius, -height/2);
    shape.quadraticCurveTo(-width/2, -height/2, -width/2, -height/2 + radius);
    shape.lineTo(-width/2, height/2 - radius);
    shape.quadraticCurveTo(-width/2, height/2, -width/2 + radius, height/2);
    shape.lineTo(width/2 - radius, height/2);
    shape.quadraticCurveTo(width/2, height/2, width/2, height/2 - radius);
    shape.lineTo(width/2, -height/2 + radius);
    shape.quadraticCurveTo(width/2, -height/2, width/2 - radius, -height/2);
    
    return shape;
  };

    return (
    <>
      {/* Add a transparent layer for detecting clicks outside of icons */}
      <mesh 
        scale={[20, 20, 20]} 
        visible={false}
        onClick={resetHoverStates}
        >
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      
      <group ref={globeGroupRef}>
        {/* Globe sphere with higher tesselation for better displacement mapping */}
        <mesh 
          ref={globeRef} 
          receiveShadow 
          castShadow
          onClick={resetHoverStates}
        >
          <sphereGeometry args={[3, 128, 128]} /> 
          <meshStandardMaterial 
            color={0xffffff}  
            roughness={0.6} 
            metalness={0.4}
            envMapIntensity={1.2}
          />
        </mesh>
        
        {/* Location markers as iOS-style app icons */}
        {locations.map((location, index) => {
          // Calculate the position on the sphere for each marker
          const phi = (90 - location.lat) * (Math.PI / 180);
          const theta = (location.lng + 180) * (Math.PI / 180);
          
          // Position slightly further from sphere surface to prevent clipping
          const distanceFactor = 3.2;
          const x = -(distanceFactor * Math.sin(phi) * Math.cos(theta));
          const z = distanceFactor * Math.sin(phi) * Math.sin(theta);
          const y = distanceFactor * Math.cos(phi);
          
          // Calculate the position on the globe surface
          const globeSurfaceFactor = 3.0;
          const surfaceX = -(globeSurfaceFactor * Math.sin(phi) * Math.cos(theta));
          const surfaceZ = globeSurfaceFactor * Math.sin(phi) * Math.sin(theta);
          const surfaceY = globeSurfaceFactor * Math.cos(phi);
          
          // Get color and icon
          const color = getLocationColor(location);
          const icon = getLocationIcon(location);
          
          // Check if this icon is hovered
          const isHovered = hoveredIcon === index;
          
          // Get the base scale factor with potential hover enhancement
          const baseScaleFactor = centeredIcons[index] || 1;
          
          // Create animated scaling when hovered
          const iconScale = isHovered ? baseScaleFactor * 1.3 : baseScaleFactor;
          
          // No truncation - display full name
          const displayName = location.name;
          
          // Create shape based on repo type
          // Use rounded rect for all repos (both public and private)
          const iconShape = createRoundedRectShape(0.15, 0.15, 0.03);
          
          // Check if we have a loaded icon texture for this location
          const hasCustomIcon = loadedIcons[location.repoName] !== undefined && loadedIcons[location.repoName] !== null;
          
          return (
            <group 
              key={index} 
              position={[0, 0, 0]}
              ref={el => {
                if (el) iconsRef.current[index] = el;
              }}
            >
              {/* Blinking alarm marker on the globe surface */}
              <mesh position={[surfaceX, surfaceY, surfaceZ]}>
                <sphereGeometry args={[0.02, 12, 12]} />
                <meshBasicMaterial 
                  color={alarmColor} 
                  opacity={alarmIntensity}
                  transparent
                />
              </mesh>
              
              {/* Connection line from surface marker to floating icon */}
              <line>
                <bufferGeometry attach="geometry" 
                  onUpdate={(self) => {
                    const positions = new Float32Array([
                      surfaceX, surfaceY, surfaceZ,
                      x, y, z
                    ]);
                    self.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                  }}
                />
                <lineBasicMaterial 
                  attach="material" 
                  color={alarmColor} 
                  opacity={alarmIntensity * 0.5} 
                  transparent 
                />
              </line>
              
              <group position={[x, y, z]}>
                <Billboard
                  follow={true}
                  lockX={false}
                  lockY={false}
                  lockZ={false}
                >
                  {/* Animated scale group based on hover state */}
                  <animated.group 
                    scale={iconScale}
                  >
                    {/* Hit detection area - larger than visual icon for easier interaction */}
                    <mesh
                      onClick={(e) => handleIconClick(location, index, e)}
                      onPointerOver={(e) => handlePointerOver(index, e)}
                      onPointerOut={handlePointerOut}
                    >
                      <circleGeometry args={[0.12, 32]} /> 
                      <meshBasicMaterial 
                        color={0xffffff}
                        transparent
                        opacity={0.001} // Almost invisible but still captures events
                      />
                    </mesh>
                    
                    {/* Icon background shape (rounded square for all repos) */}
                    <mesh>
                      <shapeGeometry args={[iconShape]} />
                      <meshBasicMaterial 
                        color={color} 
                        side={THREE.DoubleSide}
                      />
                    </mesh>
                    
                    {/* Icon image or text label */}
                    {hasCustomIcon ? (
                      <mesh position={[0, 0, 0.001]}>
                        <planeGeometry args={[0.13, 0.13]} />
                        <meshBasicMaterial
                          map={loadedIcons[location.repoName] as THREE.Texture}
                          transparent={true}
                          side={THREE.DoubleSide}
                        />
                      </mesh>
                    ) : (
                      <Text
                        position={[0, 0, 0.002]}
                        fontSize={0.075}
                        color="white"
                        anchorX="center"
                        anchorY="middle"
                        renderOrder={2}
                      >
                        {icon}
                      </Text>
                    )}
                    
                    {/* Repository label without lock icon */}
                    <Text
                      position={[0, -0.11, 0.002]}
                      fontSize={0.03}
                      color="white"
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={2}
                      maxWidth={0.8}
                      textAlign="center"
                    >
                      {location.repoName.replace('.com', '')}
                    </Text>
                    
                    {/* Location name below repo name */}
                    <Text
                      position={[0, -0.16, 0.002]}
                      fontSize={0.022} 
                      color="rgba(255,255,255,0.7)"
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={2}
                      maxWidth={0.8}
                      textAlign="center"
                    >
                      {displayName}
                    </Text>
                    
                    {/* HTML tooltip with clickable indicator - only show when hovered */}
                    {isHovered && (
                      <Html position={[0, 0.12, 0]} center>
                        <div className={styles.iconTooltip}>
                          Click to view project
              </div>
                      </Html>
                    )}
                  </animated.group>
                </Billboard>
              </group>
            </group>
          );
        })}
      </group>
      
      {/* Clouds layer - outside the globe group for independent movement */}
      <mesh 
        ref={cloudsRef} 
        position={[0, 0, 0]}
        onClick={resetHoverStates}
      >
        <sphereGeometry args={[3.05, 48, 48]} />
        <meshStandardMaterial
          color={0xffffff}
          transparent={true}
          opacity={0.8} // Higher base opacity
          alphaTest={0.05} // Lower threshold to keep more cloud pixels visible
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.FrontSide}
          emissive={new THREE.Color("#ffffff")}
          emissiveIntensity={0.05}
        />
      </mesh>
      
      <OrbitControls 
        ref={orbitControlsRef}
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.2}
        zoomSpeed={0.5}
        minDistance={5}
        maxDistance={8}
        autoRotate={isGlobeRotating}
        autoRotateSpeed={0.05}
      />
    </>
  );
}

export default function PortfolioPreview({ projects }: PortfolioPreviewProps) {
  const [locations, setLocations] = useState<EnhancedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioProjects, setPortfolioProjects] = useState<PortfolioProject[]>([]);
  const [globeOpacity, setGlobeOpacity] = useState<number>(0);
  const [globePosition, setGlobePosition] = useState<number>(50);

  // Immediately check dark mode when component mounts
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark-theme');
    console.log(`PortfolioPreview mounted, current dark mode status: ${isDarkMode}`);
    
    // Dispatch a synthetic class change event to trigger theme detection in the Globe component
    const event = new CustomEvent('theme-check', { detail: { isDarkMode } });
    document.documentElement.dispatchEvent(event);
  }, []);

  useEffect(() => {
    async function fetchLocations() {
      try {
        // Fetch both public and private repo locations (same logic as HeroSection)
        let allLocations: EnhancedLocation[] = [];
        let totalReposScanned = 0;
        
        // 1. Fetch public repos from the organization
        console.log('Fetching repositories from WebRendHQ organization...');
        const reposResponse = await axios.get('https://api.github.com/orgs/WebRendHQ/repos?per_page=100');
        const repos = reposResponse.data;
        totalReposScanned += repos.length;
        
        console.log(`Found ${repos.length} public repositories to scan`);
        
        // Try to find location.json in each public repo
        const publicLocationPromises = repos.map(async (repo: { name: string, clone_url?: string, html_url?: string, default_branch?: string }) => {
          console.log(`Scanning public repository: ${repo.name}, default branch: ${repo.default_branch || 'unknown'}`);
          
          const branchesToTry = [
            repo.default_branch,
            'main',
            'master',
            'development',
            'dev'
          ].filter(Boolean);
          
          for (const branch of branchesToTry) {
            try {
              const url = `https://raw.githubusercontent.com/WebRendHQ/${repo.name}/${branch}/location.json`;
              console.log(`Trying to fetch: ${url}`);
              
              const locationResponse = await axios.get(url, { timeout: 5000 });
              
              if (locationResponse.status === 200 && locationResponse.data) {
                const locationData = locationResponse.data;
                
                if (
                  locationData.location && 
                  typeof locationData.latitude === 'number' && 
                  typeof locationData.longitude === 'number'
                ) {
                  console.log(`✅ Found valid location.json in ${repo.name} (${branch}):`, locationData);
                  
                  const enhancedLocation: EnhancedLocation = {
                    lat: locationData.latitude,
                    lng: locationData.longitude,
                    name: locationData.location,
                    repoName: repo.name,
                    iconUrl: locationData.iconUrl || undefined,
                    isPrivate: false
                  };
                  
                  return enhancedLocation;
                } else {
                  console.log(`❌ Invalid location data in ${repo.name} (${branch}):`, locationData);
                }
              }
            } catch {
              if (branch === branchesToTry[branchesToTry.length - 1]) {
                console.log(`❌ No location.json found in ${repo.name} on any branch`);
              }
            }
          }
          
          return null;
        });
        
        // 2. Fetch private repos location data from GitHub
        console.log('Fetching private repositories location data from GitHub...');
        let privateLocations: EnhancedLocation[] = [];
        try {
          const branchesToTry = ['main', 'master', 'development', 'dev'];
          
          for (const branch of branchesToTry) {
            try {
              const privateReposUrl = `https://raw.githubusercontent.com/WebRendHQ/WebRend.com/${branch}/privatereposlocation.json`;
              console.log(`Trying to fetch private repos from: ${privateReposUrl}`);
              
              const privateReposResponse = await axios.get(privateReposUrl, { timeout: 5000 });
              
              if (privateReposResponse.status === 200 && Array.isArray(privateReposResponse.data)) {
                const privateReposData = privateReposResponse.data;
                console.log(`✅ Found ${privateReposData.length} private repositories location data`);
                
                privateLocations = privateReposData
                  .filter((repo: PrivateRepoLocationData) => 
                    repo.repoName && 
                    repo.location && 
                    typeof repo.latitude === 'number' && 
                    typeof repo.longitude === 'number'
                  )
                  .map((repo: PrivateRepoLocationData): EnhancedLocation => ({
                    lat: repo.latitude,
                    lng: repo.longitude,
                    name: repo.location,
                    repoName: repo.repoName,
                    iconUrl: repo.iconUrl,
                    isPrivate: true
                  }));
                
                totalReposScanned += privateLocations.length;
                
                if (privateLocations.length > 0) {
                  console.log(`✅ Found ${privateLocations.length} private repositories with location data`);
                  break;
                }
              }
            } catch (error) {
              console.log(`❌ Could not fetch private repos from branch ${branch}:`, error);
            }
          }
        } catch (error) {
          console.log('Error fetching private repositories location data:', error);
        }
        
        // 3. Fetch local private locations from the data directory
        console.log('Fetching local private repositories location data...');
        try {
          const response = await fetch('/api/private-locations');
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.locations)) {
              const localPrivateReposData = data.locations;
              console.log('✅ Found local private repositories data:', localPrivateReposData);
              
              const localPrivateLocations = localPrivateReposData
                .filter((repo: PrivateRepoLocationData) => 
                  repo.repoName && 
                  repo.location && 
                  typeof repo.latitude === 'number' && 
                  typeof repo.longitude === 'number'
                )
                .map((repo: PrivateRepoLocationData): EnhancedLocation => ({
                  lat: repo.latitude,
                  lng: repo.longitude,
                  name: repo.location,
                  repoName: repo.repoName,
                  iconUrl: repo.iconUrl,
                  isPrivate: true
                }));
              
              console.log(`✅ Added ${localPrivateLocations.length} private repositories from local data`);
              
              privateLocations = [...privateLocations, ...localPrivateLocations];
              totalReposScanned += localPrivateLocations.length;
            } else {
              console.log('❌ No valid private locations data found in the response', data);
            }
          } else {
            console.log(`❌ Error fetching private locations: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.log('Error fetching local private repositories data:', error);
        }
        
        // Process results from public repos
        const publicLocationResults = await Promise.allSettled(publicLocationPromises);
        
        const validPublicLocations = publicLocationResults
          .filter(
            (result): result is PromiseFulfilledResult<EnhancedLocation> => 
              result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value);
        
        // Combine public and private locations
        allLocations = [...validPublicLocations, ...privateLocations];
        
        console.log(`Found ${validPublicLocations.length} public and ${privateLocations.length} private locations from ${totalReposScanned} total repositories`);
        
        if (allLocations.length > 0) {
          setLocations(allLocations);
        } else {
          console.log('No valid locations found in repos.');
          setError('No location data found. Add location.json files to public repos or create a privatereposlocation.json file.');
          
          // Just set some placeholder locations as a fallback
          setLocations([
            { 
              lat: 40.7128, 
              lng: -74.0060, 
              name: 'New York', 
              repoName: 'Example Repo',
              isPrivate: false
            }
          ]);
        }
      } catch (error) {
        console.error('Error fetching location data:', error);
        setError('Failed to fetch location data from GitHub repositories.');
        
        // Add default location as fallback
        setLocations([
          { 
            lat: 40.7128, 
            lng: -74.0060, 
            name: 'New York', 
            repoName: 'Example Repo',
            isPrivate: false
          }
        ]);
      } finally {
        setLoading(false);
        // Add animation for globe fade-in and rise-up after loading is complete
        setTimeout(() => {
          setGlobeOpacity(1);
          setGlobePosition(0); // Move to original position
        }, 300);
      }
    }
    
    fetchLocations();
  }, []);

  // Fetch portfolio projects for mapping
  useEffect(() => {
    const fetchPortfolioProjects = async () => {
      try {
        const response = await fetch('/api/portfolio/projects');
        if (response.ok) {
          const data = await response.json();
          setPortfolioProjects(data.projects || []);
          console.log(`Loaded ${data.projects?.length || 0} portfolio projects for mapping`);
        }
      } catch (error) {
        console.error('Error fetching portfolio projects:', error);
      }
    };

    fetchPortfolioProjects();
  }, []);

  // Function to find the best matching portfolio project for a repository
  const findMatchingProject = (repoName: string) => {
    if (portfolioProjects.length === 0) {
      console.log('No portfolio projects loaded yet');
      return null;
    }

    // Try to find a project that matches the repository name
    let match = portfolioProjects.find((project: PortfolioProject) => 
      project.title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '') === 
      repoName.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '')
    );

    if (match) {
      console.log(`Found exact match for ${repoName}: ${match.title}`);
      return match;
    }

    // Try to find by keywords in the title
    const repoWords = repoName.toLowerCase().split(/[-_\s]+/).filter(word => word.length > 2);
    match = portfolioProjects.find((project: PortfolioProject) => {
      const titleWords = project.title.toLowerCase().split(/\s+/);
      return repoWords.some(repoWord => 
        titleWords.some((titleWord: string) => titleWord.includes(repoWord) || repoWord.includes(titleWord))
      );
    });

    if (match) {
      console.log(`Found keyword match for ${repoName}: ${match.title}`);
      return match;
    }

    // If no match found, return the first project as fallback
    console.log(`No specific match found for ${repoName}, using first project as fallback`);
    return portfolioProjects[0] || null;
  };

  // Configure the animation for the globe opacity and position
  const globeStyle = {
    opacity: globeOpacity,
    transform: `translateY(${globePosition}px)`,
    transition: globePosition > 0 ? 'opacity 1.5s ease-in-out, transform 2s cubic-bezier(0.19, 1, 0.22, 1)' : 'opacity 1.5s ease-in-out'
  };

  return (
    <section className={styles.portfolioSection}>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.textContent}>
            <h2 className={styles.heading}>Our Portfolio</h2>
        <p className={styles.subheading}>
              Explore our global impact through interactive project locations. Each marker represents a real-world solution we've delivered.
            </p>
            <div className={styles.ctas}>
              <Link href="/portfolio" className={styles.viewPortfolioButton}>
                View Full Portfolio
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 0L5.645 1.355L10.09 5.8H0V7.8H10.09L5.645 12.245L7 13.6L14 6.6L7 0Z" fill="currentColor"/>
          </svg>
        </Link>
            </div>
            <div className={styles.interactionPrompt}>
              <p>💫 <strong>Move the globe</strong> to discover projects worldwide</p>
            </div>
          </div>
          
          <div className={styles.globeContainer} style={globeStyle}>
            {error && <div className={styles.errorMessage}>{error}</div>}
            
            {loading ? (
              <div className={styles.loading}>Loading globe...</div>
            ) : (
              <Canvas shadows camera={{ position: [0, 0, 5.5], fov: 70 }}>
                {/* Main ambient light */}
                <ambientLight intensity={0.6} /> 
                
                {/* Key light (sun) */}
                <directionalLight 
                  position={[5, 5, 5]} 
                  intensity={1.2} 
                  castShadow 
                />
                
                {/* Fill light */}
                <directionalLight 
                  position={[-5, 3, 5]} 
                  intensity={0.8} 
                  castShadow={false}
                />
                
                {/* Rim light */}
                <directionalLight 
                  position={[0, -10, -5]} 
                  intensity={0.3} 
                  castShadow={false}
                />
                
                <Suspense fallback={null}>
                  <Globe locations={locations} findMatchingProject={findMatchingProject} />
                </Suspense>
              </Canvas>
            )}
          </div>
        </div>
      </div>
    </section>
  );
} 