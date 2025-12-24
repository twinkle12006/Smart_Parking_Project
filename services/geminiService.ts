import { GoogleGenAI, Modality, Type } from "@google/genai";
import { ParkingSpot, Coordinates } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * High-Accuracy Visual Occupancy Detection
 * Uses Gemini 3 Flash to distinguish 3D vehicles from 2D paint.
 */
export const analyzeParkingOccupancy = async (base64Image: string, spotIds: string[]): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image
          }
        },
        {
          text: `You are a high-precision parking surveillance AI. 
          Analyze the provided parking lot image. 
          The spots are labeled A1-A5 (top row) and B1-B5 (bottom row).
          
          TASK: Identify which spots are OCCUPIED by a physical 3D vehicle.
          CRITICAL RULE: Ignore all road markings, white lines, 'P' symbols, and Handicap/Accessibility icons. 
          A spot is only OCCUPIED if a vehicle (car, truck, SUV) is physically parked within it.
          If you see a blue accessibility symbol with no car on top, that spot is AVAILABLE.
          
          Return the IDs of the OCCUPIED spots as a JSON array of strings.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            occupiedSpotIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["occupiedSpotIds"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"occupiedSpotIds": []}');
    return result.occupiedSpotIds || [];
  } catch (error) {
    console.error("Vision Analysis Error:", error);
    return [];
  }
};

export const generateSpeech = async (text: string): Promise<AudioBuffer | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    return await decodeAudioData(decode(base64Audio), audioContext, 24000);
  } catch (error) {
    console.error("Gemini TTS Fail:", error);
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

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  return buffer;
}