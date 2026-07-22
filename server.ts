import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini SDK with telemetry header as required
const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper: Ensure API key is configured
function checkApiKey(res: express.Response): boolean {
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({
      error: "GEMINI_API_KEY is not configured in the Secrets panel. Please add it to start simulating.",
    });
    return false;
  }
  return true;
}

// REST API Endpoints

// 1. Get health/configuration details
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// 2. Start a brand new simulation campaign with web-grounding or normal generation
app.post("/api/simulation/start", async (req, res) => {
  if (!checkApiKey(res)) return;

  const { category, difficulty, customPrompt, webGroundingEnabled } = req.body;

  if (!category || !difficulty) {
    res.status(400).json({ error: "Category and difficulty are required." });
    return;
  }

  // Build the query to steer search grounding if enabled
  const searchQuery = `Latest key facts, standings, market prices, inflation, trends, regulations, and challenges related to being a ${category} in 2026`;

  // System instructions to ensure a perfect immersive game environment
  const systemInstruction = `You are SimVerse, the world's first AI-powered decision simulation engine. 
Your goal is to generate an immersive, highly detailed, realistic starting world for a decision-driven campaign.
The genre/role requested by the player is: "${category}".
The player has chosen a difficulty level of: "${difficulty}". 
The difficulty scaling rules are:
- Easy: Abundant starting money, highly supportive NPCs, low hazard rates.
- Normal: Standard balanced resources, neutral NPCs, typical real-world challenges.
- Hard: Scarcely available money, skeptical or demanding NPCs, elevated incident rates.
- Legendary: Near-bankrupt starting status, highly volatile or hostile NPCs, extreme constraints.
- Nightmare: Drastic survival/economic crisis, critical status, unforgiving random failures.

If web search grounding is enabled, research actual real-world news, transfers, stocks, league positions, competitors, inflation rates, or local weather in 2026, and integrate real names, companies, values, or trends in the simulated state to make it hyper-current.

Your response must strictly match the expected JSON structure. Do not include markdown codeblocks around the JSON in your response text (only return the raw JSON text directly). Create realistic, descriptive dashboard metrics, inventory items, NPCs with distinct motivations, and three interesting starting choices.`;

  const userPrompt = `Generate the starting scenario for:
Simulator Category: ${category}
Difficulty: ${difficulty}
${customPrompt ? `Player's Custom Scenario Constraints: "${customPrompt}"` : ""}
${webGroundingEnabled ? `Web Intelligence Grounding is active! Please integrate authentic current real-world status and events of 2026.` : ""}

Please define:
- campaign title
- major objective
- initial story narration introducing the starting crisis/challenge
- 4 to 5 contextual metrics (e.g. money, reputation, health, support, supplies, quality, hazard, coalitional backing, oxygen etc.)
- 2 to 3 NPCs with specific roles, attitudes, and initial attitudes out of 100
- 2 to 3 initial items in inventory
- 3 immediate suggested choices reflecting the narrative crisis`;

  try {
    const config: any = {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Compact, creative title for this simulation, e.g. 'Red Planet Pioneer' or 'Westside Bistro'" },
          objective: { type: Type.STRING, description: "The core ultimate goal for this difficulty" },
          story: { type: Type.STRING, description: "A highly detailed, elegant narrative paragraph setting the immediate stage, stakes, and current crisis." },
          metrics: {
            type: Type.ARRAY,
            description: "4-5 key numerical dashboard metrics reflecting the status of the simulation.",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Lower-case key, e.g. 'money', 'reputation', 'health', 'energy', 'support'" },
                label: { type: Type.STRING, description: "Readable label, e.g., 'Bank Balance ($)', 'Staff Loyalty (%)', 'Oxygen Reserves (%)'" },
                value: { type: Type.STRING, description: "The starting value representation, e.g., '150,000' or '85'" },
                icon: { type: Type.STRING, description: "Lucide icon name, e.g., 'DollarSign', 'Heart', 'Shield', 'Users', 'Flame', 'Boxes', 'Zap', 'Award', 'Activity'" },
                description: { type: Type.STRING, description: "What this metric tracks" },
                min: { type: Type.NUMBER },
                max: { type: Type.NUMBER }
              },
              required: ["name", "label", "value", "icon"]
            }
          },
          npcs: {
            type: Type.ARRAY,
            description: "2-3 starting key NPCs that the player must interact with.",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                relationship: { type: Type.NUMBER, description: "Rating from 0 to 100" },
                status: { type: Type.STRING, description: "Adjective representing current attitude" },
                memory: { type: Type.STRING, description: "What they currently think of you or their immediate request" }
              },
              required: ["name", "role", "relationship", "status"]
            }
          },
          inventory: {
            type: Type.ARRAY,
            description: "2-3 items in inventory",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                type: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["id", "name", "quantity"]
            }
          },
          suggestedChoices: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3 highly immersive, branching choices for this turn."
          }
        },
        required: ["title", "objective", "story", "metrics", "npcs", "inventory", "suggestedChoices"]
      }
    };

    let response;
    let fallbackUsed = false;
    let actualWebGroundingEnabled = webGroundingEnabled;

    if (actualWebGroundingEnabled) {
      config.tools = [{ googleSearch: {} }];
    }

    try {
      response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          { role: "user", parts: [{ text: userPrompt }] }
        ],
        config,
      });
    } catch (err: any) {
      // If search grounding was enabled and it failed (e.g. 429 quota error or API key restrictions),
      // we fall back to standard text generation without googleSearch.
      if (actualWebGroundingEnabled) {
        console.log("[Info] Search Grounding quota limit reached or unavailable. Falling back to standard offline knowledge model.");
        fallbackUsed = true;
        actualWebGroundingEnabled = false;
        delete config.tools;
        response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            { role: "user", parts: [{ text: userPrompt }] }
          ],
          config,
        });
      } else {
        throw err;
      }
    }

    const text = response.text || "{}";
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, "");
      cleanedText = cleanedText.replace(/\n?```$/, "");
      cleanedText = cleanedText.trim();
    }

    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (parseErr: any) {
      console.error("Failed to parse Gemini response as JSON (start):", cleanedText);
      res.status(500).json({
        error: "The AI model returned an invalid structure. Please try generating again.",
        details: parseErr.message,
      });
      return;
    }

    // Extract search grounding metadata if available to return to the client
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks
      ? groundingChunks
          .filter((c: any) => c.web)
          .map((c: any) => ({
            title: c.web.title || "Web Reference",
            uri: c.web.uri || "",
          }))
      : [];

    res.json({
      success: true,
      data: parsedData,
      sources: sources,
      searchQueries: actualWebGroundingEnabled ? [searchQuery] : [],
      webGroundingFallback: fallbackUsed,
    });
  } catch (error: any) {
    console.error("Error starting simulation:", error);
    res.status(500).json({
      error: "Failed to generate simulation. Please try again.",
      details: error.message,
    });
  }
});

// 3. Step: process a player decision and dynamically generate the consequence
app.post("/api/simulation/step", async (req, res) => {
  if (!checkApiKey(res)) return;

  const {
    category,
    difficulty,
    decision,
    historyLog,
    currentMetrics,
    currentNpcs,
    currentInventory,
    turnCount,
    webGroundingEnabled
  } = req.body;

  if (!decision) {
    res.status(400).json({ error: "Player decision is required." });
    return;
  }

  const systemInstruction = `You are SimVerse, evaluating a player's decision inside a realistic simulation campaign.
Genre: "${category}" (Difficulty: "${difficulty}"). Current Turn: ${turnCount + 1}.

You MUST evaluate the player's choice logically and realistically:
- Actions have immediate short-term and long-term trade-offs. (e.g. laying off employees boosts Cash but crushes Trust and Reputation).
- Update the simulation metrics accurately. Include trends ('up', 'down', 'neutral') indicating how they shifted compared to the previous state.
- Characters/NPCs remember decisions, change attitudes, and speak contextual dialogue.
- Generate a dynamic news article or social media timeline feedback about the consequence of this decision.
- Check if this choice triggers a milestone ending (game over) or unlocks any simulation achievements (e.g., 'First Million', 'Billionaire', 'Perfect Ending', 'Crisis Averted', 'Total Ruin').
- If the turn count exceeds 15, or metrics like Cash or Health drop to 0, or the objective is fully met, trigger an immersive GameOver ending.
- Provide 3 brand new, highly distinct choices or branching directions for the next turn. Options MUST be directly tied to the new sequential event and NEVER repeat previously suggested options or past decisions.

Your response must strictly match the JSON structure. Do not wrap JSON in markdown tags.`;

  const userPrompt = `Evaluate this player decision:
Decision Chosen: "${decision}"

--- SIMULATION CONTEXT ---
Difficulty: ${difficulty}
Previous Event: "${historyLog[historyLog.length - 1]?.outcome || ""}"
Current Metrics State: ${JSON.stringify(currentMetrics)}
Current Character Statuses: ${JSON.stringify(currentNpcs)}
Current Inventory: ${JSON.stringify(currentInventory)}
Turn Count so far: ${turnCount}

Please output the outcome of this decision. Ensure:
- consequence: narrative describing what immediately occurs.
- nextEvent: introduces the next sequential scene/crisis that happens soon after.
- updatedMetrics: updated list of metrics with changed values or updated trends. Keep the values as strings but update the amount logically (e.g. if cash was "200,000", increase or decrease it based on the action).
- npcs: updated NPC relationships, attitudes, and what they say or remember.
- inventoryChanges: additions or removals of items.
- news: an article detailing public/market/media reaction.
- suggestedChoices: 3 new dynamic choice options.
- isGameOver: whether the simulation has concluded.
- endingSummary: descriptive ending review if isGameOver is true.
- achievementsUnlocked: list of string achievements unlocked this turn if appropriate.`;

  try {
    const config: any = {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          consequence: { type: Type.STRING, description: "Immersive description of what happened immediately after the player's choice." },
          nextEvent: { type: Type.STRING, description: "A continuation paragraph presenting the next dilemma, meeting, market shift, or hazard." },
          updatedMetrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.STRING, description: "The new stringified value representation, e.g., '135,000' or '78'" },
                trend: { type: Type.STRING, description: "Must be: 'up', 'down', or 'neutral'" }
              },
              required: ["name", "value", "trend"]
            }
          },
          npcs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                relationship: { type: Type.NUMBER },
                status: { type: Type.STRING },
                memory: { type: Type.STRING, description: "Dialogue or direct feedback on the player's last decision." }
              },
              required: ["name", "role", "relationship", "status"]
            }
          },
          inventoryChanges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                action: { type: Type.STRING, description: "one of: 'add', 'remove', 'none'" }
              },
              required: ["id", "name", "quantity", "action"]
            }
          },
          news: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              source: { type: Type.STRING },
              sentiment: { type: Type.STRING, description: "Must be 'positive', 'negative', or 'neutral'" },
              impactText: { type: Type.STRING }
            },
            required: ["headline", "source", "sentiment", "impactText"]
          },
          suggestedChoices: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3 new high-quality dynamic suggested decisions."
          },
          isGameOver: { type: Type.BOOLEAN },
          endingSummary: { type: Type.STRING, description: "Rich details of the end rating and final summary if isGameOver is true" },
          achievementsUnlocked: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Any milestone achievements unlocked in this turn."
          }
        },
        required: ["consequence", "nextEvent", "updatedMetrics", "npcs", "suggestedChoices", "isGameOver"]
      }
    };

    let response;
    let fallbackUsed = false;
    let actualWebGroundingEnabled = webGroundingEnabled;

    if (actualWebGroundingEnabled) {
      config.tools = [{ googleSearch: {} }];
    }

    try {
      response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          { role: "user", parts: [{ text: userPrompt }] }
        ],
        config,
      });
    } catch (err: any) {
      if (actualWebGroundingEnabled) {
        console.log("[Info] Search Grounding failed on step, falling back to standard offline generation.");
        fallbackUsed = true;
        actualWebGroundingEnabled = false;
        delete config.tools;
        response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            { role: "user", parts: [{ text: userPrompt }] }
          ],
          config,
        });
      } else {
        throw err;
      }
    }

    const text = response.text || "{}";
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, "");
      cleanedText = cleanedText.replace(/\n?```$/, "");
      cleanedText = cleanedText.trim();
    }

    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (parseErr: any) {
      console.error("Failed to parse Gemini response as JSON (step):", cleanedText);
      res.status(500).json({
        error: "The AI model returned an invalid structure. Please try generating again.",
        details: parseErr.message,
      });
      return;
    }

    res.json({
      success: true,
      data: parsedData,
      webGroundingFallback: fallbackUsed,
    });
  } catch (error: any) {
    console.error("Error executing simulation step:", error);
    res.status(500).json({
      error: "Failed to process simulation step.",
      details: error.message,
    });
  }
});

// Configure Vite or serve static production bundle
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode serving static dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SimVerse backend online on http://0.0.0.0:${PORT}`);
  });
}

startServer();
