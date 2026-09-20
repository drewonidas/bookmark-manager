import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

export interface AISummaryResult {
  summary: string;
  keyTakeaways: string[];
  suggestedTags: string[];
}

let genAiClient: GoogleGenAI | null = null;
if (env.GEMINI_API_KEY) {
  genAiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

export async function generateBookmarkSynthesis(params: {
  title: string;
  excerpt?: string;
  content?: string;
}): Promise<AISummaryResult | null> {
  if (!genAiClient) {
    return null;
  }

  const textToAnalyze = params.content?.slice(0, 15000) || params.excerpt || params.title;

  try {
    const prompt = `You are an editorial reading assistant for a high-craft bookmark sanctuary.
Analyze the following article content:

TITLE: ${params.title}
CONTENT:
${textToAnalyze}

Please output a strictly valid JSON object with the following fields:
{
  "summary": "A concise 2-3 sentence editorial summary capturing the core premise.",
  "keyTakeaways": ["Key takeaway point 1", "Key takeaway point 2", "Key takeaway point 3"],
  "suggestedTags": ["#topic1", "#topic2", "#topic3"]
}
Do not enclose in markdown code fences. Output only valid JSON.`;

    const response = await genAiClient.interactions.create({
      model: 'gemini-3.8-flash',
      input: prompt,
    });

    const outputText = response.output_text?.trim();
    if (!outputText) return null;

    // Clean any accidental markdown fence
    const cleanJson = outputText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      summary: parsed.summary || '',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags.map((t: string) => (t.startsWith('#') ? t : `#${t}`))
        : [],
    };
  } catch (error) {
    console.error('Gemini synthesis error:', error);
    return null;
  }
}
