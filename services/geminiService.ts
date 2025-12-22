
import { GoogleGenAI, Modality } from "@google/genai";
import { ParkingSpot, Coordinates } from "../types";

// Initialize Gemini Client using environment variable API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Text-to-Speech (TTS) ---

export const generateSpeech = async (text: string): Promise<AudioBuffer | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      console.warn("No audio data received from Gemini.");
      return null;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      audioContext,
      24000 // Standard sample rate for raw PCM audio from Gemini TTS
    );
    return audioBuffer;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

export const playAudioBuffer = (buffer: AudioBuffer) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);
};

// --- Navigation Logic ---

export const getNavigationInstruction = async (
  currentLoc: Coordinates,
  targetSpot: ParkingSpot,
  spots: ParkingSpot[],
  rotation: number // NEW: Heading of the car
): Promise<string> => {
  const prompt = `
    You are a precise navigation voice assistant for a parking lot.
    
    Context:
    - Map Grid: 0-100 x 0-100. (0,0 is Top-Left).
    - User Position: X:${Math.round(currentLoc.x)}, Y:${Math.round(currentLoc.y)}.
    - User Heading: ${Math.round(rotation)} degrees. 
      (0 = Facing Right/East, 90 = Facing Down/South, 180 = Facing Left/West, -90/270 = Facing Up/North).
    - Target Spot: ${targetSpot.id} at X:${targetSpot.x}, Y:${targetSpot.y}.

    Logic:
    1. Calculate if the user has passed the spot or is driving away from it based on their heading and position. 
       - If they have passed it or are moving in the wrong direction, COMMAND: "Go back" or "Turn around".
    2. If they are approaching normally, guide them: "Turn left", "Turn right", or "Proceed straight".
    3. If very close (<5 units), say "Spot is on your [left/right]".

    Constraint: Return ONLY the command string. Max 10 words. No Markdown.
  `;

  try {
    // Update to gemini-3-flash-preview for Basic Text Tasks (e.g., simple Q&A)
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    // Accessing .text as a property as per guidelines
    return response.text?.trim() || "Proceed to the highlighted spot.";
  } catch (e) {
    console.error(e);
    return "Proceed to your designated spot.";
  }
};

// --- Analytics Helper ---

export const getAdminInsights = async (stats: any, logs: any[]): Promise<string> => {
  const prompt = `
    Analyze this parking data:
    Occupancy: ${stats.occupancyRate}%. Revenue: $${stats.revenue}. Avg Search Time: ${stats.avgSearchTime}s.
    Recent Logs: ${JSON.stringify(logs.slice(0, 3))}.
    
    Provide a 2-sentence executive summary for the parking administrator.
  `;
  try {
    // Update to gemini-3-flash-preview for summarization tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    // Accessing .text as a property as per guidelines
    return response.text?.trim() || "Data analysis unavailable.";
  } catch (e) {
    return "System operating normally.";
  }
};


// --- Utilities ---

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data returned by the Gemini API.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // Ensure the buffer length is even for 16-bit array conversion
  if (data.byteLength % 2 !== 0) {
     const newData = new Uint8Array(data.byteLength + 1);
     newData.set(data);
     data = newData;
  }

  const dataInt16 = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize 16-bit signed integer to [-1.0, 1.0] float for AudioContext
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
