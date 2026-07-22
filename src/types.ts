export type Difficulty = "easy" | "normal" | "hard" | "legendary" | "nightmare";

export interface StatMetric {
  name: string;      // machine key, e.g. "money", "reputation"
  label: string;     // user-facing label, e.g. "Balance" or "Fan Support"
  value: number | string;
  icon: string;      // lucide icon key
  trend?: "up" | "down" | "neutral";
  description?: string;
  min?: number;
  max?: number;
}

export interface NPC {
  name: string;
  role: string;
  relationship: number; // 0 - 100
  status: string;       // e.g. "Loyal", "Angry", "Suspicious"
  memory?: string;      // brief statement of what they remember
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  type?: string;        // e.g. "Resource", "Weapon", "Unlockable"
  description?: string;
}

export interface NewsArticle {
  headline: string;
  source: string;       // e.g. "Daily Tribune", "Wall Street Journal", "Fan Radio"
  sentiment: "positive" | "negative" | "neutral";
  impactText: string;   // short details
}

export interface SimulationLogEntry {
  turn: number;
  decision: string;
  outcome: string;
}

export interface GameState {
  id: string;
  category: string;
  title: string;
  difficulty: Difficulty;
  turnCount: number;
  objective: string;
  story: string;
  metrics: StatMetric[];
  npcs: NPC[];
  inventory: InventoryItem[];
  newsHistory: NewsArticle[];
  log: SimulationLogEntry[];
  theme: {
    primaryColor: string; // e.g. "indigo", "emerald"
    bgGradient: string;   // tailwind class
    iconName: string;     // lucide icon name
  };
  isGameOver: boolean;
  endingSummary?: string;
  achievementsUnlocked: string[];
  savedAt: string;
  webGroundingEnabled: boolean;
  searchGroundingQueries?: string[];
  searchGroundingSources?: Array<{ title: string; uri: string }>;
  suggestedChoices?: string[];
  metricHistory?: Array<{ turn: number; [metricName: string]: number }>;
}

export interface SaveSlot {
  id: string;
  name: string;
  category: string;
  turnCount: number;
  savedAt: string;
  state: GameState;
}

export interface SimulationCategory {
  id: string;
  name: string;
  description: string;
  iconName: string;
  themeColor: string; // Tailwind color e.g., "blue"
  bgGradient: string;   // e.g., "from-blue-900/40 to-slate-900"
  tags: string[];
  suggestedSearch: string;
  defaultObjective: string;
  imageUrl?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  iconName: string;
  unlockedAt?: string;
}

export interface UserStats {
  simulationsCompleted: number;
  totalTurnsPlayed: number;
  unlockedAchievementsCount: number;
  favoriteCategory: string;
}
