import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import {
  Users, Zap, Flame, Shield, Globe, Eye, Key, Coffee, Trophy, Compass, TrendingUp, Activity,
  Search, Play, AlertCircle, Sparkles, RefreshCw, ChevronRight, HelpCircle, Save, Download,
  Upload, ChevronLeft, Award, Newspaper, BookOpen, Check, Heart, Globe as Globe2,
  CheckCircle2, ChevronDown, Trash2, HelpCircle as HelpIcon, ArrowRight, LogOut, Info, Link as LinkIcon,
  Volume2, VolumeX
} from "lucide-react";
import { CATEGORIES, ACHIEVEMENTS } from "./data";
import { GameState, SaveSlot, Difficulty, SimulationCategory, NPC, StatMetric, InventoryItem, NewsArticle } from "./types";

// Dynamic Icon Mapping to safely render Lucide icons in a type-safe way
const iconMap: Record<string, React.ComponentType<any>> = {
  Users, Zap, Flame, Shield, Globe, Eye, Key, Coffee, Trophy, Compass, TrendingUp, Activity,
  Award, Newspaper, Heart, CheckCircle2, HelpIcon, Search, Play, Save, Download, Upload, Trash2
};

const chartColors = ["#818cf8", "#34d399", "#fb7185", "#fbbf24", "#22d3ee", "#e879f9"];

function renderCategoryIcon(iconName: string, className = "w-5 h-5") {
  const IconComponent = iconMap[iconName] || HelpCircle;
  return <IconComponent className={className} />;
}

function AnimatedMetricValue({ valueString }: { valueString: string }) {
  // Extract number and formatting context
  const cleanNumberStr = valueString.replace(/[^0-9.-]/g, "");
  const numValue = parseFloat(cleanNumberStr);

  const [displayValue, setDisplayValue] = useState(isNaN(numValue) ? 0 : numValue);

  // Keep track of decimal places in the original string
  const decimalMatch = cleanNumberStr.match(/\.(\d+)/);
  const decimalPlaces = decimalMatch ? decimalMatch[1].length : 0;

  useEffect(() => {
    if (isNaN(numValue)) return;
    
    let start = displayValue;
    const end = numValue;
    if (start === end) return;

    const duration = 800; // ms
    const startTime = performance.now();
    let animationFrameId: number;

    const updateNumber = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const current = start + (end - start) * easeProgress;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateNumber);
      }
    };

    animationFrameId = requestAnimationFrame(updateNumber);
    return () => cancelAnimationFrame(animationFrameId);
  }, [numValue]);

  if (isNaN(numValue)) {
    return <span className="text-sm font-extrabold text-white">{valueString}</span>;
  }

  const hasCommas = valueString.includes(",");
  let formattedNum = "";
  if (hasCommas) {
    formattedNum = displayValue.toLocaleString("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    });
  } else {
    formattedNum = displayValue.toFixed(decimalPlaces);
  }

  // Preserve non-numeric parts by replacing the number pattern
  const numPattern = /[0-9,.-]+/;
  const finalString = valueString.replace(numPattern, formattedNum);

  return (
    <motion.span
      key={valueString}
      initial={{ scale: 1.2, color: "#818cf8" }}
      animate={{ scale: 1, color: "#ffffff" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="inline-block text-sm font-extrabold text-white"
    >
      {finalString}
    </motion.span>
  );
}

function getMetricValueAsNumber(val: string | number): number {
  if (typeof val === "number") return val;
  const clean = val.replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function buildHistoryPoint(turn: number, metrics: StatMetric[]) {
  const point: { turn: number; [key: string]: number } = { turn };
  metrics.forEach(m => {
    point[m.label] = getMetricValueAsNumber(m.value);
  });
  return point;
}

export default function App() {
  // Screens state: 'splash' | 'categories' | 'settings' | 'active' | 'gameover'
  const [screen, setScreen] = useState<"splash" | "categories" | "settings" | "active" | "gameover">("splash");
  
  // Custom Selection parameters
  const [selectedCategory, setSelectedCategory] = useState<SimulationCategory | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [customPrompt, setCustomPrompt] = useState("");
  const [webGroundingEnabled, setWebGroundingEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Game/Simulation Active State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [customDecisionText, setCustomDecisionText] = useState("");
  const [activeTab, setActiveTab] = useState<"narrative" | "log" | "npcs">("narrative");
  const [visibleMetrics, setVisibleMetrics] = useState<Record<string, boolean>>({});
  
  const toggleMetricVisibility = (label: string) => {
    setVisibleMetrics(prev => ({
      ...prev,
      [label]: prev[label] === false ? true : false
    }));
  };
  const [shakeTrigger, setShakeTrigger] = useState(0);
  
  // Global Save Slots & Lifetime Stats (localStorage persisted)
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [lifetimeTurns, setLifetimeTurns] = useState(0);
  const [completedSims, setCompletedSims] = useState(0);
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<string[]>([]);
  
  // UI Helpers
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSaveSuccessToast, setShowSaveSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showSaveSlotModal, setShowSaveSlotModal] = useState(false);
  const [showResignConfirmModal, setShowResignConfirmModal] = useState(false);
  const [selectedSaveSlotIndex, setSelectedSaveSlotIndex] = useState<number | null>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");

  // Speech bubble helper to trigger on NPC hover/click
  const [activeNpcSpeech, setActiveNpcSpeech] = useState<string | null>(null);

  // AI Narrator Voice state using Web Speech API
  const [aiNarratorEnabled, setAiNarratorEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    if (!text) return;

    // Clean up Markdown markings (*, #, _, `, etc.) to prevent pronunciation issues
    const cleanText = text
      .replace(/[*#_`~]/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Choose an English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha") || v.name.includes("Microsoft"))
    ) || voices.find(v => v.lang.startsWith("en"));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleManualSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else if (gameState?.story) {
      speakText(gameState.story);
    }
  };

  // Automatically trigger speech when story text changes (e.g., turn advances) if narrator is enabled
  useEffect(() => {
    if (screen === "active" && gameState?.story) {
      if (aiNarratorEnabled) {
        speakText(gameState.story);
      } else {
        stopSpeaking();
      }
    } else {
      stopSpeaking();
    }

    return () => {
      stopSpeaking();
    };
  }, [gameState?.story, aiNarratorEnabled, screen]);

  // References
  const narrativeEndRef = useRef<HTMLDivElement>(null);

  // Loading quotes pool to cycle through for better UX
  const loadingMessages = [
    "Analyzing simulation boundaries...",
    "Scanning live 2026 data streams for Grounding...",
    "Calibrating dynamic NPC relationship nodes...",
    "Configuring regional and micro-economic parameters...",
    "Drafting complex decision branching events...",
    "Injecting real-world weather and regulations..."
  ];

  // 1. Load initial states from localStorage
  useEffect(() => {
    try {
      const savedSaves = localStorage.getItem("simverse_saves");
      if (savedSaves) setSaveSlots(JSON.parse(savedSaves));

      const turns = localStorage.getItem("simverse_lifetime_turns");
      if (turns) setLifetimeTurns(parseInt(turns, 10));

      const completed = localStorage.getItem("simverse_completed_sims");
      if (completed) setCompletedSims(parseInt(completed, 10));

      const achievements = localStorage.getItem("simverse_unlocked_achievements");
      if (achievements) setUnlockedAchievementIds(JSON.parse(achievements));
    } catch (e) {
      console.error("Failed loading persistent states:", e);
    }
  }, []);

  // Save changes to localStorage helper
  const saveUserData = (updatedSaves: SaveSlot[], updatedTurns: number, updatedCompleted: number, updatedAchievements: string[]) => {
    localStorage.setItem("simverse_saves", JSON.stringify(updatedSaves));
    localStorage.setItem("simverse_lifetime_turns", updatedTurns.toString());
    localStorage.setItem("simverse_completed_sims", updatedCompleted.toString());
    localStorage.setItem("simverse_unlocked_achievements", JSON.stringify(updatedAchievements));
    
    setSaveSlots(updatedSaves);
    setLifetimeTurns(updatedTurns);
    setCompletedSims(updatedCompleted);
    setUnlockedAchievementIds(updatedAchievements);
  };

  // Toast dispatch helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setShowSaveSuccessToast(true);
    setTimeout(() => setShowSaveSuccessToast(false), 3500);
  };

  // Retry Action State for failed operational dispatches
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);

  // Robust fetch helper with automatic retries for transient 404/502/503 cold-start delays
  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    retries = 3,
    delayMs = 1200
  ): Promise<Response> => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          return response;
        }

        const text = await response.clone().text().catch(() => "");
        const isTransient =
          response.status === 404 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504 ||
          text.includes("NOT_FOUND") ||
          text.includes("could not be found") ||
          text.includes("bom1::");

        if (isTransient && attempt < retries) {
          console.warn(`[SimVerse Retry] Endpoint ${url} returned transient ${response.status}. Retrying attempt ${attempt}/${retries}...`);
          await new Promise((res) => setTimeout(res, delayMs * attempt));
          continue;
        }
        return response;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((res) => setTimeout(res, delayMs * attempt));
          continue;
        }
      }
    }
    if (lastError) throw lastError;
    return fetch(url, options);
  };

  // Scroll active narratives to view on turn advance
  useEffect(() => {
    if (screen === "active") {
      narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameState?.turnCount, screen]);

  // Loading animation cycle helper
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      let idx = 0;
      setLoadingMessage(loadingMessages[0]);
      interval = setInterval(() => {
        idx = (idx + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[idx]);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // 2. Start Simulation API dispatch
  const handleStartSimulation = async () => {
    if (!selectedCategory) return;
    setLoading(true);
    setErrorMessage(null);
    setRetryAction(null);

    try {
      const response = await fetchWithRetry("/api/simulation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory.name,
          difficulty: difficulty,
          customPrompt: customPrompt,
          webGroundingEnabled: webGroundingEnabled,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errMsg = "Simulation generator failed.";
        if (response.status === 404 && (errorText.includes("NOT_FOUND") || errorText.includes("could not be found") || errorText.includes("bom1::"))) {
          errMsg = "The SimVerse backend server was waking up. Please click 'Retry' to load your simulation!";
        } else {
          try {
            const parsedErr = JSON.parse(errorText);
            errMsg = parsedErr.error || parsedErr.message || errMsg;
          } catch {
            errMsg = `Server Error (${response.status}): ${errorText.substring(0, 150)}`;
          }
        }
        setRetryAction(() => () => handleStartSimulation());
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      if (!resJson.success) {
        setRetryAction(() => () => handleStartSimulation());
        throw new Error(resJson.error || "Simulation generator failed. Make sure your API key is configured.");
      }

      const generated = resJson.data;
      const actualWebGrounding = webGroundingEnabled && !resJson.webGroundingFallback;
      const initialGameState: GameState = {
        id: Math.random().toString(36).substring(2, 11),
        category: selectedCategory.id,
        title: generated.title || `${selectedCategory.name} Scenario`,
        difficulty: difficulty,
        turnCount: 1,
        objective: generated.objective || selectedCategory.defaultObjective,
        story: generated.story,
        metrics: generated.metrics || [],
        npcs: generated.npcs || [],
        inventory: generated.inventory || [],
        newsHistory: [],
        log: [{ turn: 1, decision: "Scenario Start", outcome: generated.story }],
        theme: {
          primaryColor: selectedCategory.themeColor,
          bgGradient: selectedCategory.bgGradient,
          iconName: selectedCategory.iconName,
        },
        isGameOver: false,
        achievementsUnlocked: [],
        savedAt: new Date().toLocaleString(),
        webGroundingEnabled: actualWebGrounding,
        searchGroundingQueries: actualWebGrounding ? (resJson.searchQueries || []) : [],
        searchGroundingSources: actualWebGrounding ? (resJson.sources || []) : [],
        metricHistory: [buildHistoryPoint(1, generated.metrics || [])],
      };

      setGameState(initialGameState);
      setShakeTrigger(0);
      setScreen("active");
      if (resJson.webGroundingFallback) {
        showToast(`Simulation started using simulated offline knowledge (Web Grounding quota exceeded).`);
      } else {
        showToast(`Campaign '${initialGameState.title}' generated successfully!`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Step Action API dispatch (Evaluate Choice)
  const handleEvaluateDecision = async (chosenOption: string) => {
    if (!gameState) return;
    setLoading(true);
    setErrorMessage(null);
    setRetryAction(null);

    try {
      const response = await fetchWithRetry("/api/simulation/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: CATEGORIES.find(c => c.id === gameState.category)?.name || gameState.category,
          difficulty: gameState.difficulty,
          decision: chosenOption,
          historyLog: gameState.log,
          currentMetrics: gameState.metrics,
          currentNpcs: gameState.npcs,
          currentInventory: gameState.inventory,
          turnCount: gameState.turnCount,
          webGroundingEnabled: gameState.webGroundingEnabled,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errMsg = "Failed to progress decision.";
        if (response.status === 404 && (errorText.includes("NOT_FOUND") || errorText.includes("could not be found") || errorText.includes("bom1::"))) {
          errMsg = "The SimVerse backend server was waking up. Please click 'Retry' to process your decision!";
        } else {
          try {
            const parsedErr = JSON.parse(errorText);
            errMsg = parsedErr.error || parsedErr.message || errMsg;
          } catch {
            errMsg = `Server Error (${response.status}): ${errorText.substring(0, 150)}`;
          }
        }
        setRetryAction(() => () => handleEvaluateDecision(chosenOption));
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      if (!resJson.success) {
        setRetryAction(() => () => handleEvaluateDecision(chosenOption));
        throw new Error(resJson.error || "Failed to progress decision.");
      }

      const stepData = resJson.data;

      // Detect if this is a high-impact crisis or negative event
      const isNegativeNews = stepData.news?.sentiment === "negative";
      const hasDownMetric = stepData.updatedMetrics?.some((m: any) => m.trend === "down");
      const hasCrisisKeywords = (stepData.consequence + " " + stepData.nextEvent).toLowerCase().match(/(crisis|hazard|disaster|threat|emergency|catastrophe|breach|fail|meltdown)/);

      if (isNegativeNews || hasDownMetric || hasCrisisKeywords) {
        setShakeTrigger(prev => prev + 1);
      }

      // Unify state updates
      const updatedTurnCount = gameState.turnCount + 1;
      const newLogEntry = {
        turn: updatedTurnCount,
        decision: chosenOption,
        outcome: stepData.consequence + "\n\n" + stepData.nextEvent,
      };

      // Process Metrics changes
      const mergedMetrics = gameState.metrics.map(existing => {
        const update = stepData.updatedMetrics?.find((u: any) => u.name.toLowerCase() === existing.name.toLowerCase());
        return update
          ? { ...existing, value: update.value, trend: update.trend || "neutral" as any }
          : existing;
      });

      // Update Inventory changes
      let mergedInventory = [...gameState.inventory];
      if (stepData.inventoryChanges) {
        stepData.inventoryChanges.forEach((change: any) => {
          const matchIndex = mergedInventory.findIndex(i => i.id === change.id || i.name.toLowerCase() === change.name.toLowerCase());
          if (matchIndex > -1) {
            if (change.action === "remove") {
              mergedInventory[matchIndex].quantity = Math.max(0, mergedInventory[matchIndex].quantity - change.quantity);
            } else {
              mergedInventory[matchIndex].quantity += change.quantity;
            }
          } else if (change.action !== "remove") {
            mergedInventory.push({
              id: change.id || Math.random().toString(),
              name: change.name,
              quantity: change.quantity,
              type: "Item",
              description: "Acquired during simulation"
            });
          }
        });
      }

      // Check and Unlock Achievements
      const newlyUnlockedAchievements: string[] = [];
      if (stepData.achievementsUnlocked) {
        stepData.achievementsUnlocked.forEach((id: string) => {
          // Normalise ID
          const formattedId = id.toLowerCase().replace(/\s+/g, "_");
          const achievementTemplate = ACHIEVEMENTS.find(a => a.id === formattedId || a.title.toLowerCase() === id.toLowerCase());
          const matchId = achievementTemplate ? achievementTemplate.id : "crisis_solver";
          
          if (!unlockedAchievementIds.includes(matchId)) {
            newlyUnlockedAchievements.push(matchId);
          }
        });
      }

      const freshAchievements = [...unlockedAchievementIds, ...newlyUnlockedAchievements];

      const actualWebGrounding = gameState.webGroundingEnabled && !resJson.webGroundingFallback;
      const nextState: GameState = {
        ...gameState,
        turnCount: updatedTurnCount,
        story: stepData.nextEvent,
        metrics: mergedMetrics,
        npcs: stepData.npcs || gameState.npcs,
        inventory: mergedInventory,
        newsHistory: stepData.news ? [stepData.news, ...gameState.newsHistory] : gameState.newsHistory,
        log: [...gameState.log, newLogEntry],
        isGameOver: stepData.isGameOver || false,
        endingSummary: stepData.endingSummary,
        achievementsUnlocked: [...gameState.achievementsUnlocked, ...newlyUnlockedAchievements],
        savedAt: new Date().toLocaleString(),
        webGroundingEnabled: actualWebGrounding,
        metricHistory: [
          ...(gameState.metricHistory || []),
          buildHistoryPoint(updatedTurnCount, mergedMetrics)
        ],
      };

      // Auto-update Lifetime stats
      const nextTurnsCount = lifetimeTurns + 1;
      let nextCompleted = completedSims;
      if (nextState.isGameOver) {
        nextCompleted += 1;
      }

      // Save to Slot slots immediately for perfect persistence
      const updatedSaves = saveSlots.map(slot => {
        if (slot.state.id === gameState.id) {
          return { ...slot, turnCount: updatedTurnCount, savedAt: new Date().toLocaleString(), state: nextState };
        }
        return slot;
      });

      saveUserData(updatedSaves, nextTurnsCount, nextCompleted, freshAchievements);
      setGameState(nextState);
      setCustomDecisionText("");

      if (resJson.webGroundingFallback) {
        showToast(`Turn evaluated with simulated offline knowledge (Web Grounding unavailable).`);
      }

      if (newlyUnlockedAchievements.length > 0) {
        newlyUnlockedAchievements.forEach(accId => {
          const item = ACHIEVEMENTS.find(a => a.id === accId);
          showToast(`🏆 Achievement Unlocked: ${item ? item.title : "Crisis Master"}!`);
        });
      }

      if (nextState.isGameOver) {
        setScreen("gameover");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to advance turn.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Save Current Progress to Slot
  const handleSaveToSlot = (slotIndex: number) => {
    if (!gameState) return;

    const slotId = `slot-${slotIndex}`;
    const newSave: SaveSlot = {
      id: slotId,
      name: `Slot ${slotIndex + 1} - ${gameState.title}`,
      category: gameState.category,
      turnCount: gameState.turnCount,
      savedAt: new Date().toLocaleString(),
      state: gameState,
    };

    const updatedSaves = [...saveSlots];
    const existingIndex = updatedSaves.findIndex(s => s.id === slotId);
    if (existingIndex > -1) {
      updatedSaves[existingIndex] = newSave;
    } else {
      updatedSaves.push(newSave);
    }

    saveUserData(updatedSaves, lifetimeTurns, completedSims, unlockedAchievementIds);
    showToast(`Simulation saved to Slot ${slotIndex + 1}!`);
    setShowSaveSlotModal(false);
  };

  // Delete slot helper
  const handleDeleteSlot = (slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = saveSlots.filter(s => s.id !== slotId);
    saveUserData(updated, lifetimeTurns, completedSims, unlockedAchievementIds);
    showToast("Save slot deleted.");
  };

  // Resume game slot helper
  const handleLoadSave = (slot: SaveSlot) => {
    setGameState(slot.state);
    setShakeTrigger(0);
    setSelectedCategory(CATEGORIES.find(c => c.id === slot.state.category) || null);
    setScreen("active");
    showToast(`Resumed: ${slot.state.title}`);
  };

  // 5. JSON Export/Import for physical save backups
  const handleExportSave = () => {
    if (!gameState) return;
    const fileData = JSON.stringify(gameState, null, 2);
    const blob = new Blob([fileData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `simverse_save_${gameState.title.toLowerCase().replace(/\s+/g, "_")}.json`;
    link.click();
    showToast("Exported save package successfully!");
  };

  const handleImportSave = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && parsed.id && parsed.title && parsed.metrics) {
            setGameState(parsed);
            setShakeTrigger(0);
            setSelectedCategory(CATEGORIES.find(c => c.id === parsed.category) || null);
            setScreen("active");
            showToast(`Imported Save: ${parsed.title}`);
          } else {
            alert("Invalid save file structure.");
          }
        } catch (err) {
          alert("Failed to parse save file JSON.");
        }
      };
    }
  };

  // Filter categories by search
  const filteredCategories = CATEGORIES.filter(c =>
    c.name.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
    c.tags.some(tag => tag.toLowerCase().includes(categorySearchQuery.toLowerCase()))
  );

  return (
    <div className="relative overflow-hidden min-h-screen bg-slate-950 flex flex-col justify-between select-none text-slate-100">
      
      {/* Background Mesh Gradient */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-800 blur-[120px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-emerald-500/20 blur-[100px]"></div>
      </div>
      
      {/* Sleek Header Section */}
      <header className="relative z-40 bg-white/5 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setScreen("splash")}>
          <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-serif text-xl font-bold shadow-sm">
            S
          </div>
          <div>
            <h1 className="font-serif text-2xl font-black tracking-tight text-white">
              Sim<span className="text-indigo-400 font-sans font-semibold text-lg uppercase tracking-widest ml-1">Verse</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">AI-Powered Decision Simulator</p>
          </div>
        </div>

        {/* Global Achievement Display in header */}
        <div className="flex items-center space-x-4 sm:space-x-6">
          <div className="hidden sm:flex items-center space-x-2 bg-indigo-500/10 rounded-full py-1 px-3 border border-indigo-500/20">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-300">
              {unlockedAchievementIds.length} / {ACHIEVEMENTS.length} Achievements
            </span>
          </div>

          {screen === "active" && gameState && (
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <button
                onClick={() => setShowSaveSlotModal(true)}
                className="flex items-center space-x-1.5 text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg py-2 px-3 sm:py-1.5 sm:px-3 transition min-h-[40px]"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Save State</span>
              </button>
              <button
                onClick={handleExportSave}
                title="Export save file"
                className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition min-h-[40px] flex items-center justify-center"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowResignConfirmModal(true)}
                className="flex items-center space-x-1.5 text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 rounded-lg py-2 px-3 sm:py-1.5 sm:px-3 transition min-h-[40px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Sim</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Render */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative">
        <AnimatePresence mode="wait">
          
          {/* SCREEN 1: SPLASH & LIFETIME OVERVIEW */}
          {screen === "splash" && (
            <motion.div
              key="splash"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-12"
            >
              {/* Product value card */}
              <div className="text-center space-y-4 max-w-3xl mx-auto py-8">
                <div className="inline-flex items-center space-x-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Version 1.0 MVP Live</span>
                </div>
                <h2 className="font-serif text-3xl sm:text-5xl font-black text-white leading-tight">
                  The world's first AI-powered <br className="hidden sm:inline" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
                    decision simulator.
                  </span>
                </h2>
                <p className="text-slate-300 text-lg leading-relaxed max-w-2xl mx-auto font-normal">
                  Step into hyper-realistic, dynamic roles where every choice dictates live consequences, NPC attitudes, random crises, and custom endings. No scripted paths. Just pure intelligence.
                </p>
                <div className="pt-4 flex flex-wrap justify-center gap-4">
                  <button
                    onClick={() => setScreen("categories")}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition flex items-center space-x-2 text-base cursor-pointer"
                  >
                    <span>Launch Simulation</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <label className="border border-white/10 hover:border-white/25 text-slate-200 cursor-pointer font-semibold py-3 px-6 rounded-xl transition flex items-center space-x-2 text-base hover:bg-white/5">
                    <Upload className="w-4 h-4" />
                    <span>Load External JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportSave}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Grid: Resume Slots vs Profile Statistics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* 1. Resume Game Save slots */}
                <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl space-y-6 text-white">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div className="flex items-center space-x-2.5">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-serif text-xl font-bold text-white">Active Campaign Slots</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Auto-saved hourly</span>
                  </div>

                  <div className="space-y-4">
                    {[0, 1, 2].map((idx) => {
                      const slotId = `slot-${idx}`;
                      const slot = saveSlots.find(s => s.id === slotId);

                      if (slot) {
                        const cat = CATEGORIES.find(c => c.id === slot.category);
                        return (
                          <div
                            key={slotId}
                            onClick={() => handleLoadSave(slot)}
                            className="group relative border border-white/10 hover:border-indigo-500/40 rounded-xl p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition"
                          >
                            <div className="flex items-center space-x-4">
                              <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center text-indigo-400 font-bold">
                                {cat ? renderCategoryIcon(cat.iconName, "w-6 h-6") : <HelpIcon className="w-6 h-6" />}
                              </div>
                              <div>
                                <h4 className="font-bold text-white group-hover:text-indigo-400 transition">
                                  {slot.state.title}
                                </h4>
                                <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                                  <span>Turn {slot.turnCount}</span>
                                  <span>•</span>
                                  <span className="capitalize">{slot.state.difficulty}</span>
                                  <span>•</span>
                                  <span>Saved {slot.savedAt}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={(e) => handleDeleteSlot(slotId, e)}
                              title="Delete Slot"
                              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={slotId}
                          onClick={() => setScreen("categories")}
                          className="border border-dashed border-white/10 hover:border-indigo-500/30 rounded-xl p-5 flex items-center justify-center cursor-pointer hover:bg-white/5 transition text-slate-400"
                        >
                          <span className="text-xs font-semibold">Empty Slot {idx + 1} - Start Campaign</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Stats and Achievements Panel */}
                <div className="space-y-6">
                  {/* Stats widget */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl space-y-4 text-white">
                    <h3 className="font-serif text-lg font-bold text-white">Your SimVerse Record</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-center">
                        <span className="block text-2xl font-bold text-white">{lifetimeTurns}</span>
                        <span className="text-xs text-slate-400 font-medium">Decisions Logged</span>
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-center">
                        <span className="block text-2xl font-bold text-white">{completedSims}</span>
                        <span className="text-xs text-slate-400 font-medium">Completed Campaigns</span>
                      </div>
                    </div>
                  </div>

                  {/* Achievements overview */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl space-y-4 text-white">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif text-lg font-bold text-white">Milestone Achievements</h3>
                      <span className="text-xs font-bold text-indigo-400">
                        {unlockedAchievementIds.length} / {ACHIEVEMENTS.length}
                      </span>
                    </div>

                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {ACHIEVEMENTS.map((ach) => {
                        const isUnlocked = unlockedAchievementIds.includes(ach.id);
                        return (
                          <div
                            key={ach.id}
                            className={`flex items-start space-x-3 p-3 rounded-xl border transition ${
                              isUnlocked ? "bg-amber-500/5 border-amber-500/20" : "bg-white/5 border-transparent opacity-60"
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${isUnlocked ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-slate-500"}`}>
                              {renderCategoryIcon(ach.iconName, "w-4 h-4")}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white flex items-center">
                                {ach.title}
                                {isUnlocked && <span className="ml-1.5 text-[10px] text-amber-300 font-semibold bg-amber-500/20 rounded px-1">Unlocked</span>}
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-0.5">{ach.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

              </div>
            </motion.div>
          )}

          {/* SCREEN 2: CHOOSE SIMULATION PROFILE */}
          {screen === "categories" && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <button
                    onClick={() => setScreen("splash")}
                    className="inline-flex items-center space-x-1 text-slate-400 hover:text-white text-xs font-semibold mb-2"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <h2 className="font-serif text-3xl font-black text-white">Select Simulator Category</h2>
                  <p className="text-sm text-slate-400">Pick from 12 pristine decision environments</p>
                </div>

                {/* Categories search bar */}
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search templates or tags..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl py-2 pl-9 pr-4 text-sm font-medium text-white placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Grid representation */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCategories.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setScreen("settings");
                    }}
                    className={`group bg-gradient-to-br ${cat.bgGradient} border border-white/10 rounded-2xl p-6 cursor-pointer hover:shadow-xl hover:border-white/20 transition text-white relative overflow-hidden backdrop-blur-lg`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-3 bg-white/10 rounded-xl text-white">
                        {renderCategoryIcon(cat.iconName, "w-6 h-6")}
                      </div>
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {cat.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-white/10 text-white font-semibold py-0.5 px-2 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 space-y-2">
                      <h3 className="font-serif text-xl font-bold text-white group-hover:text-indigo-300 transition">
                        {cat.name}
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed font-normal">
                        {cat.description}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-indigo-300 group-hover:text-white transition">
                      <span>Launch Configuration</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>

              {filteredCategories.length === 0 && (
                <div className="text-center py-12 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                  <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-400 font-medium">No simulation templates found matching "{categorySearchQuery}"</p>
                </div>
              )}
            </motion.div>
          )}

          {/* SCREEN 3: SIMULATION SETTINGS */}
          {screen === "settings" && selectedCategory && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-2xl mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-4 sm:p-8 space-y-6 sm:space-y-8 text-white"
            >
              <div className="flex items-center space-x-3 pb-4 border-b border-white/10">
                <button
                  onClick={() => setScreen("categories")}
                  className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition min-h-[44px] flex items-center justify-center"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-white">Configure Simulation</h2>
                  <p className="text-xs text-slate-400">Fine-tune complexity and rules for {selectedCategory.name}</p>
                </div>
              </div>

              {/* Grid selection list of Difficulty */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-200">Select Difficulty Level</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {(["easy", "normal", "hard", "legendary", "nightmare"] as Difficulty[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDifficulty(level)}
                      className={`capitalize py-2 px-3 text-xs font-bold rounded-lg border transition ${
                        difficulty === level
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                          : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  {difficulty === "easy" && "🏆 Great for learning. High cash buffers, generous NPC support."}
                  {difficulty === "normal" && "⚖️ Standard balanced environment with typical real-world dilemmas."}
                  {difficulty === "hard" && "⚠️ Scarcity active. Skeptical NPCs, critical starting debt, elevated crisis events."}
                  {difficulty === "legendary" && "🔥 Extreme constraint. Near bankruptcy, volatile NPCs, zero margins for error."}
                  {difficulty === "nightmare" && "💀 Pure chaos survival. Severe starting emergency, hostile environments, critical failures."}
                </p>
              </div>

              {/* Web search intelligence API toggler */}
              <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-1.5">
                    <Globe className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span className="text-sm font-bold text-slate-200">Toggle Web Intelligence API</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Uses Gemini's built-in Google Search grounding to scan live 2026 data. Simulates actual current transfers, market inflation rates, local regulations, and active competitors.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={webGroundingEnabled}
                    onChange={(e) => setWebGroundingEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Custom prompts constraints */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-200">Add Custom Starting Constraints (Optional)</label>
                  <span className="text-xs text-slate-400">E.g., "Set in hyperinflation", "Own Messi"</span>
                </div>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Formulate any specific scenario conditions (e.g., 'Start as a highly controversial prime minister during an oil strike', or 'Survival in a flooded urban center')."
                  className="w-full bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl p-3 text-sm font-medium text-white placeholder-slate-400 h-24"
                />
              </div>

              <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  onClick={() => setScreen("categories")}
                  className="w-full sm:w-auto border border-white/10 hover:bg-white/5 text-slate-200 font-semibold py-3 px-6 rounded-xl transition text-sm min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartSimulation}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-xl shadow-md transition text-sm flex items-center justify-center space-x-2 min-h-[44px]"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Bootstrap SimVerse</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN 4: THE SIMULATION DASHBOARD (ACTIVE CAMPAIGN) */}
          {screen === "active" && gameState && (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Top Banner Status Bar */}
              {/* Top Banner Status Bar */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-white">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full capitalize">
                      {CATEGORIES.find(c => c.id === gameState.category)?.name || gameState.category}
                    </span>
                    <span className="bg-white/10 text-slate-300 border border-white/10 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full capitalize">
                      {gameState.difficulty} Difficulty
                    </span>
                    {gameState.webGroundingEnabled && (
                      <span className="inline-flex items-center space-x-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full">
                        <Globe className="w-3 h-3 animate-spin" />
                        <span>Web Intelligence Grounded</span>
                      </span>
                    )}
                  </div>
                  <h2 className="font-serif text-xl sm:text-2xl font-extrabold text-white">{gameState.title}</h2>
                </div>

                <div className="flex items-center space-x-4 bg-white/5 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10 w-full md:w-auto justify-between md:justify-start">
                  <div className="text-center border-r border-white/10 pr-4 shrink-0">
                    <span className="block text-xs text-slate-400 font-bold uppercase tracking-wider">Turn</span>
                    <span className="text-xl font-black text-white">{gameState.turnCount}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Objective</span>
                    <p className="text-xs font-bold text-slate-300 line-clamp-1 max-w-sm">{gameState.objective}</p>
                  </div>
                </div>
              </div>

              {/* Core 3-Column Simulation Sandbox Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* COLUMN 1: METRICS & NPCs STATUS (3 / 12 width) */}
                <div className="order-2 lg:order-1 lg:col-span-3 space-y-6">

                  {/* Numerical Metrics Cards list */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl space-y-4 text-white">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Simulation Metrics</h3>
                    <div className="space-y-3">
                      {gameState.metrics.map((metric) => (
                        <div
                          key={metric.name}
                          title={metric.description}
                          className="p-3.5 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-2.5">
                            <div className="p-1.5 bg-white/5 text-indigo-400 rounded-lg border border-white/5">
                              {renderCategoryIcon(metric.icon, "w-4 h-4")}
                            </div>
                            <div>
                              <span className="block text-xs font-bold text-slate-400">{metric.label}</span>
                              <AnimatedMetricValue valueString={metric.value} />
                            </div>
                          </div>

                          {/* Render Trend indicator */}
                          {metric.trend && (
                            <div className="text-xs font-extrabold">
                              {metric.trend === "up" && <span className="text-emerald-400">▲ +</span>}
                              {metric.trend === "down" && <span className="text-rose-400">▼ -</span>}
                              {metric.trend === "neutral" && <span className="text-slate-500">•</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Character/NPC lists */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl space-y-4 text-white">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Dynamic Characters</h3>
                    <div className="space-y-3">
                      {gameState.npcs.map((npc) => (
                        <div
                          key={npc.name}
                          onClick={() => setActiveNpcSpeech(activeNpcSpeech === npc.name ? null : npc.name)}
                          className={`p-3 border rounded-xl cursor-pointer transition ${
                            activeNpcSpeech === npc.name ? "bg-indigo-500/10 border-indigo-500/40" : "bg-white/5 hover:bg-white/10 border-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-white">{npc.name}</h4>
                              <span className="text-[10px] text-slate-400 font-medium">{npc.role}</span>
                            </div>
                            <span className="text-[10px] font-bold text-indigo-400">{npc.status}</span>
                          </div>

                          {/* Relationship progress scale */}
                          <div className="mt-2.5 space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-slate-400">
                              <span>Relationship</span>
                              <span>{npc.relationship}/100</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1">
                              <div
                                className="bg-indigo-500 h-1 rounded-full transition-all duration-500"
                                style={{ width: `${npc.relationship}%` }}
                              />
                            </div>
                          </div>

                          {/* Dynamic expandable bubble dialogue memory */}
                          {activeNpcSpeech === npc.name && npc.memory && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="mt-3 pt-2.5 border-t border-indigo-500/20 text-[11px] text-indigo-300 leading-relaxed italic"
                            >
                              "{npc.memory}"
                            </motion.div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory panel */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl space-y-4 text-white">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Roster & Inventory</h3>
                    {gameState.inventory.length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-medium">No items in stock.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {gameState.inventory.map((item) => (
                          <span
                            key={item.id || item.name}
                            title={item.description}
                            className="bg-white/5 text-slate-300 border border-white/10 text-xs font-semibold rounded-lg py-1 px-2.5"
                          >
                            {item.name} ({item.quantity})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* COLUMN 2: PRIMARY STORY NARRATIVE & DECISION ENTRY (6 / 12 width) */}
                <div className="order-1 lg:order-2 lg:col-span-6 space-y-6">
                  
                  {/* Interactive Tab Switcher */}
                  <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl space-x-1">
                    <button
                      onClick={() => setActiveTab("narrative")}
                      className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                        activeTab !== "log"
                          ? "bg-indigo-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Simulation Story</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("log")}
                      className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                        activeTab === "log"
                          ? "bg-indigo-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Timeline Trends</span>
                    </button>
                  </div>

                  {activeTab !== "log" ? (
                    /* Immersive narration log view */
                    <motion.div
                      animate={shakeTrigger > 0 ? {
                        x: [0, -6, 6, -6, 6, -3, 3, 0],
                        borderColor: ["rgba(255,255,255,0.1)", "rgba(244,63,94,0.4)", "rgba(244,63,94,0.4)", "rgba(255,255,255,0.1)"],
                        backgroundColor: ["rgba(255,255,255,0.05)", "rgba(244,63,94,0.05)", "rgba(244,63,94,0.05)", "rgba(255,255,255,0.05)"]
                      } : {}}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                      key={shakeTrigger}
                      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col justify-between min-h-[350px] sm:min-h-[450px] text-white"
                    >
                      
                      <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-3 gap-2">
                          <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-widest">Active Scenario File</span>
                          
                          <div className="flex items-center flex-wrap gap-2">
                            {/* AI Narrator Control Toggle */}
                            <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 shadow-inner">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Narrator:</span>
                              <button
                                onClick={() => setAiNarratorEnabled(!aiNarratorEnabled)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  aiNarratorEnabled ? "bg-indigo-600" : "bg-slate-700"
                                }`}
                                title="Toggle AI Narrator Voice"
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    aiNarratorEnabled ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Manual speak/replay controls */}
                            <div className="flex items-center">
                              <button
                                onClick={handleManualSpeak}
                                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-extrabold uppercase tracking-wider transition cursor-pointer ${
                                  isSpeaking
                                    ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                                    : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20"
                                }`}
                                title={isSpeaking ? "Stop Voice Narration" : "Read Aloud Current Story"}
                              >
                                {isSpeaking ? (
                                  <>
                                    <VolumeX className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                                    <span>Stop Voice</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Read Aloud</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                          {gameState.log.map((entry, idx) => (
                            <div key={idx} className="space-y-3 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                              {idx > 0 && (
                                <div className="flex justify-end my-1">
                                  <div className="max-w-[90%] bg-indigo-500/15 border border-indigo-500/20 text-slate-100 rounded-2xl rounded-tr-sm px-4 py-2 text-xs font-semibold leading-relaxed shadow-sm">
                                    <span className="block text-[9px] text-indigo-300 font-extrabold uppercase tracking-widest mb-0.5">Turn {entry.turn - 1} Decision</span>
                                    <span>{entry.decision}</span>
                                  </div>
                                </div>
                              )}
                              <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-sans antialiased tracking-normal font-normal">
                                {entry.outcome}
                              </div>
                            </div>
                          ))}
                          <div ref={narrativeEndRef} />
                        </div>
                      </div>

                      {/* Grounding references banner */}
                      {gameState.webGroundingEnabled && gameState.searchGroundingSources && gameState.searchGroundingSources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <div className="flex items-center space-x-1 mb-2">
                            <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Web Intelligence Sources:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {gameState.searchGroundingSources.map((src, i) => (
                              <a
                                key={i}
                                href={src.uri}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded px-2 py-0.5 max-w-[150px] truncate transition inline-block"
                              >
                                {src.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Interactive Action input triggers */}
                      <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
                        
                        {/* Suggested branch selection buttons */}
                        <div className="grid grid-cols-1 gap-2">
                          {gameState.log[gameState.log.length - 1]?.outcome && 
                           CATEGORIES.find(c => c.id === gameState.category)?.id && (
                            gameState.turnCount === gameState.log[gameState.log.length - 1].turn ? (
                              // Use parsed suggestedChoices if Turn matches
                              (gameState as any).suggestedChoices || [
                                "Consolidate local operations and evaluate cashflow",
                                "Draft emergency response strategy with senior executives",
                                "Host immediate public address addressing the current crisis"
                              ]
                            ) : (
                              // Fallback choices
                              [
                                "Investigate current emergency options",
                                "Consult dynamic advisor team",
                                "Enact protective operational protocol"
                              ]
                            )
                          ).map((choice: string, idx: number) => (
                            <button
                              key={idx}
                              disabled={loading}
                              onClick={() => handleEvaluateDecision(choice)}
                              className="text-left w-full bg-white/5 border border-white/10 hover:border-indigo-500/40 hover:bg-white/10 text-slate-200 hover:text-white rounded-xl p-3.5 text-xs font-semibold transition flex items-center justify-between"
                            >
                              <span>{choice}</span>
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>

                        {/* Custom User free-text entering input */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Or Formulate Custom Decision</label>
                            <span className="text-[10px] text-slate-400">AI dynamic sandbox active</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              placeholder="Type literally anything you'd do next..."
                              value={customDecisionText}
                              onChange={(e) => setCustomDecisionText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && customDecisionText.trim()) {
                                  handleEvaluateDecision(customDecisionText);
                                }
                              }}
                              className="flex-1 bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl py-3 px-4 text-xs font-semibold text-white placeholder-slate-400 min-h-[44px]"
                            />
                            <button
                              disabled={loading || !customDecisionText.trim()}
                              onClick={() => handleEvaluateDecision(customDecisionText)}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-3 px-4 font-bold text-xs transition animate-pulse min-h-[44px]"
                            >
                              Commit
                            </button>
                          </div>
                        </div>

                      </div>

                    </motion.div>
                  ) : (
                    /* Interactive Analytics and Chart View */
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 text-white min-h-[450px]"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-4">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-400" />
                            <span>Timeline Metrics Analytics</span>
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Track and analyze simulation variables and thresholds across turns.</p>
                        </div>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 font-extrabold border border-indigo-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto">
                          Campaign Turn {gameState.turnCount}
                        </span>
                      </div>

                      {/* Interactive Filter legend */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Interactive Legend (Toggle Lines)</label>
                        <div className="flex flex-wrap gap-2">
                          {gameState.metrics.map((m, i) => {
                            const isVisible = visibleMetrics[m.label] !== false;
                            const color = chartColors[i % chartColors.length];
                            return (
                              <button
                                key={m.label}
                                onClick={() => toggleMetricVisibility(m.label)}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition flex items-center space-x-1.5 cursor-pointer ${
                                  isVisible
                                    ? "bg-white/5 text-white border-white/20 shadow-sm"
                                    : "bg-transparent text-slate-500 border-white/5 hover:border-white/10"
                                }`}
                                style={isVisible ? { borderLeft: `3px solid ${color}` } : undefined}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: isVisible ? color : "#64748b" }}
                                />
                                <span>{m.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Chart Core Rendering */}
                      <div className="bg-slate-950/40 border border-white/5 rounded-xl p-4 flex items-center justify-center min-h-[300px]">
                        {gameState.metricHistory && gameState.metricHistory.length > 0 ? (
                          <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={gameState.metricHistory} margin={{ top: 15, right: 15, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                <XAxis
                                  dataKey="turn"
                                  stroke="#64748b"
                                  fontSize={10}
                                  fontWeight={600}
                                  tickLine={false}
                                  axisLine={false}
                                  tickFormatter={(v) => `Turn ${v}`}
                                  dy={10}
                                />
                                <YAxis 
                                  stroke="#64748b" 
                                  fontSize={10} 
                                  fontWeight={600}
                                  tickLine={false} 
                                  axisLine={false}
                                  dx={-5}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#0f172a",
                                    borderColor: "rgba(255,255,255,0.1)",
                                    borderRadius: "12px",
                                    fontSize: "12px",
                                    color: "#fff",
                                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)"
                                  }}
                                  formatter={(value: any, name: any) => [`${value}`, name]}
                                  labelFormatter={(label) => `Turn ${label}`}
                                />
                                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ display: "none" }} />
                                {gameState.metrics.map((m, i) => {
                                  if (visibleMetrics[m.label] === false) return null;
                                  return (
                                    <Line
                                      key={m.label}
                                      type="monotone"
                                      dataKey={m.label}
                                      stroke={chartColors[i % chartColors.length]}
                                      strokeWidth={3}
                                      dot={{ r: 4, strokeWidth: 1, fill: "#0f172a" }}
                                      activeDot={{ r: 6, strokeWidth: 0 }}
                                      animationDuration={500}
                                    />
                                  );
                                })}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-slate-500 space-y-2">
                            <Activity className="w-8 h-8 mx-auto stroke-[1.5] animate-pulse text-indigo-400" />
                            <p className="text-xs font-semibold">Generating timeline graph data...</p>
                          </div>
                        )}
                      </div>

                      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 text-[11px] text-indigo-300 leading-relaxed flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>Strategy Tip:</strong> Hover over the graph nodes to view specific score changes. Maintain metrics balanced above critical levels to ensure survival and unlock legendary scenario achievements.
                        </span>
                      </div>
                    </motion.div>
                  )}

                </div>

                {/* COLUMN 3: PUBLIC TIMELINE & LIVE NEWS FEED (3 / 12 width) */}
                <div className="order-3 lg:order-3 lg:col-span-3 space-y-6">
                  
                  {/* Generated News timeline component */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl space-y-4 text-white">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Media & Public Reactions</h3>
                    
                    {gameState.newsHistory.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 space-y-2">
                        <Newspaper className="w-8 h-8 mx-auto stroke-[1.5]" />
                        <p className="text-xs font-medium">Decisions trigger headlines.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {gameState.newsHistory.slice(0, 3).map((news, i) => (
                          <div key={i} className="border-b border-white/5 last:border-0 pb-4 last:pb-0 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{news.source}</span>
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${
                                news.sentiment === "positive" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
                                news.sentiment === "negative" ? "bg-rose-500/10 text-rose-300 border-rose-500/20" : "bg-white/10 text-slate-300 border-white/10"
                              } uppercase`}>
                                {news.sentiment}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-white leading-snug">
                              "{news.headline}"
                            </h4>
                            <p className="text-[10px] text-slate-300 font-medium">
                              {news.impactText}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Public opinion timelines feedback */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl space-y-3 text-white">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Live Reactions</span>
                      <span className="text-[10px] bg-white/10 border border-white/10 text-slate-300 font-bold px-1.5 rounded-full">Feed</span>
                    </div>

                    <div className="space-y-2 text-[11px] font-normal leading-relaxed text-slate-300 max-h-48 overflow-y-auto">
                      {gameState.newsHistory.length === 0 ? (
                        <p className="text-slate-400 italic">No feedback timeline yet.</p>
                      ) : (
                        gameState.newsHistory.slice(0, 4).map((news, idx) => (
                          <div key={idx} className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-300">
                              @{news.source.toLowerCase().replace(/\s+/g, "")}fan
                            </span>
                            <p className="text-slate-400 italic">
                              "{news.sentiment === 'positive' ? 'This is absolutely what we needed!' : news.sentiment === 'negative' ? 'Are they out of their minds??' : 'Let\'s see how this unfolds...'}"
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>
            </motion.div>
          )}

          {/* SCREEN 5: GAME OVER ENDING SUMMARY */}
          {screen === "gameover" && gameState && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-4 sm:p-8 text-center space-y-6 sm:space-y-8 text-white"
            >
              <div className="space-y-3">
                <div className="w-16 h-16 bg-rose-500/10 text-rose-300 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
                  <Award className="w-8 h-8" />
                </div>
                <h2 className="font-serif text-3xl font-black text-white">Campaign Concluded</h2>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-extrabold">Final Ending Debrief</p>
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/10 text-left space-y-4">
                <h3 className="font-serif text-lg font-bold text-white">Ending Evaluation:</h3>
                <p className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-sans antialiased tracking-normal font-normal">
                  {gameState.endingSummary || "You survived the campaign! Review your stats and achievements below to see your ultimate impact on the simulation timeline."}
                </p>
              </div>

              {/* End Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="block text-2xl font-black text-indigo-400">{gameState.turnCount}</span>
                  <span className="text-xs text-slate-400 font-semibold">Turns Survived</span>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="block text-2xl font-black text-indigo-400 capitalize">{gameState.difficulty}</span>
                  <span className="text-xs text-slate-400 font-semibold">Difficulty Mode</span>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10 col-span-2 sm:col-span-1">
                  <span className="block text-2xl font-black text-indigo-400">{gameState.achievementsUnlocked.length}</span>
                  <span className="text-xs text-slate-400 font-semibold">Achievements Unlocked</span>
                </div>
              </div>

              {/* Retry / Menu panel */}
              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  onClick={() => {
                    setScreen("splash");
                    setGameState(null);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-xl shadow-md transition text-sm flex items-center justify-center space-x-2 min-h-[44px] w-full sm:w-auto"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Main Menu</span>
                </button>
                <button
                  onClick={() => {
                    const template = CATEGORIES.find(c => c.id === gameState.category);
                    if (template) {
                      setSelectedCategory(template);
                      setScreen("settings");
                    }
                  }}
                  className="border border-white/10 hover:bg-white/5 text-slate-200 font-semibold py-3 px-6 rounded-xl transition text-sm min-h-[44px] w-full sm:w-auto"
                >
                  Restart Campaign
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Global Auto Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6"
          >
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl text-white">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="space-y-2">
                <h3 className="font-serif text-lg font-bold text-white">Consulting SimVerse AI</h3>
                <p className="text-slate-300 text-xs font-semibold animate-pulse">
                  {loadingMessage}
                </p>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed italic">
                Simulating dynamic worlds and state reactions. This may take up to 10 seconds.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Save Slot Modal */}
      <AnimatePresence>
        {showSaveSlotModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl text-white"
            >
              <div className="space-y-1">
                <h3 className="font-serif text-xl font-bold text-white">Archive Timeline State</h3>
                <p className="text-xs text-slate-400">Commit your active simulation parameters to a persistent memory partition.</p>
              </div>

              <div className="space-y-3">
                {[0, 1, 2].map((idx) => {
                  const slotId = `slot-${idx}`;
                  const slot = saveSlots.find(s => s.id === slotId);

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSaveToSlot(idx)}
                      className="w-full text-left border border-white/10 hover:border-indigo-500/40 hover:bg-white/5 p-4 rounded-xl flex items-center justify-between transition group"
                    >
                      <div>
                        <span className="block font-bold text-[10px] text-indigo-400 uppercase tracking-widest">Archive Chamber {idx + 1}</span>
                        <span className="block text-sm font-bold text-slate-200 mt-1">
                          {slot ? slot.state.title : "Unallocated Sector"}
                        </span>
                        {slot && (
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            Turn {slot.turnCount} • Overwrite History
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-400 transition">Commit State</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowSaveSlotModal(false)}
                  className="text-xs font-bold text-slate-400 hover:text-white py-2 px-4 transition"
                >
                  Return
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Resign/Exit Confirmation Modal */}
      <AnimatePresence>
        {showResignConfirmModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 space-y-6 shadow-2xl text-white"
            >
              <div className="space-y-2 text-center">
                <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
                  <LogOut className="w-5 h-5" />
                </div>
                <h3 className="font-serif text-lg font-bold text-white">Abort Active Campaign?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to end this simulation? Any unsaved state will be permanently unlinked from the database.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowResignConfirmModal(false)}
                  className="border border-white/10 hover:bg-white/5 text-slate-200 font-semibold py-2.5 px-4 rounded-xl transition text-xs min-h-[40px]"
                >
                  Resume Sim
                </button>
                <button
                  onClick={() => {
                    setShowResignConfirmModal(false);
                    setScreen("splash");
                    setGameState(null);
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md transition text-xs min-h-[40px]"
                >
                  Confirm Exit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Save/Achievement success toast */}
      <AnimatePresence>
        {showSaveSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white border border-white/10 shadow-2xl rounded-xl py-3 px-5 flex items-center space-x-3"
          >
            <Check className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Error Banner alerts */}
      {errorMessage && (
        <div className="fixed bottom-6 left-6 max-w-sm bg-rose-500/10 border border-rose-500/25 rounded-xl p-4 shadow-xl z-50 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-rose-300">Operational Failure</h4>
            <p className="text-[11px] text-rose-200 leading-relaxed font-normal">{errorMessage}</p>
            <div className="flex items-center space-x-3 pt-1">
              {retryAction && (
                <button
                  onClick={() => {
                    const action = retryAction;
                    setErrorMessage(null);
                    setRetryAction(null);
                    if (action) action();
                  }}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-extrabold rounded-lg shadow transition cursor-pointer"
                >
                  Retry Now
                </button>
              )}
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setRetryAction(null);
                }}
                className="text-[10px] font-bold text-rose-400 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Footer */}
      <footer className="border-t border-white/5 bg-slate-950/50 backdrop-blur-md py-4 px-6 text-center text-xs text-slate-500 font-medium">
        &copy; 2026 SimVerse Decision Engine. Developed in AI Studio. Powered by Gemini. All rights reserved.
      </footer>

    </div>
  );
}
