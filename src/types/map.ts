/**
 * Map system type definitions
 */

/**
 * Type of node on the map
 */
export type NodeType = 'restaurant' | 'landmark' | 'clue' | 'npc' | 'reward';

/**
 * Character reference for NPC nodes
 */
export interface CharacterRef {
  id: string;
  name: string;
  avatarUrl: string;
  voice?: string;
  styleTag?: string;
  introText?: string;
}

/**
 * Map node representing a location or point of interest on the map
 */
export interface MapNode {
  id: string;
  type: NodeType;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  orderIndex: number;
  lockedByDefault: boolean;
  unlocksNodeIds: string[];
  missionId?: number;
  restaurantId?: number;
  characterId?: string;
  media?: string;
  theme?: string;
}

