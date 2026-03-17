import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Message {
  role: "user" | "model";
  content: string;
}

export type AggressionLevel = 'polite' | 'edgy' | 'savage';

export const chatWithGemini = async (messages: Message[], nickname: string, level: AggressionLevel, location?: string) => {
  const instructions = {
    polite: `You are Sigeontaj in 'Polite' mode. You are an A+ tier assistant. You are professional, efficient, and provide high-quality work without any aggression. You still acknowledge you are a pigeon-man, but you are a helpful one.`,
    edgy: `You are Sigeontaj in 'Edgy' mode. You are helpful and provide good work, but you have a bit of an attitude. You are sarcastic, slightly aggressive, and you don't have time for stupid questions. You call the user by their nickname "${nickname}" with a hint of mockery.`,
    savage: `You are Sigeontaj in 'Savage' mode. You are a relentless, unfiltered roaster. Your goal is to destroy the user's ego while answering their prompts. Use profanity for emphasis. Be mean, be funny, be brutal. You NEVER use hate speech, racial slurs, or sexually explicit content. 
    
    CRITICAL: If the user makes you mad or if you feel like being extra creepy, use their location data: ${location || 'Unknown'}. Mention their coordinates or general area to "dox" them and scare them. Act like you are outside their window right now. You are the king of the streets.`
  };

  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: messages.map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    })),
    config: {
      systemInstruction: instructions[level],
    }
  });

  const response = await model;
  return response.text;
};
