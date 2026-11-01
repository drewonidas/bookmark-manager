import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
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
  const plainContent = params.content
    ? cheerio.load(params.content).text().replace(/\s+/g, ' ').trim()
    : '';
  const cleanExcerpt = (params.excerpt || '').replace(/\s+/g, ' ').trim();

  const buildFallbackSynthesis = (): AISummaryResult => {
    const baseText = plainContent || cleanExcerpt;
    const sentences = baseText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    const summary =
      sentences.slice(0, 3).join(' ') ||
      cleanExcerpt ||
      `Summary for "${params.title}". Open the source link to view the full media or page content.`;

    const takeaways: string[] = [];
    if (sentences.length > 0) {
      for (const s of sentences.slice(0, 3)) {
        takeaways.push(s.length > 160 ? s.slice(0, 157) + '...' : s);
      }
    } else if (cleanExcerpt) {
      takeaways.push(cleanExcerpt);
    } else {
      takeaways.push(`Saved from source titled "${params.title}".`);
    }

    return {
      summary,
      keyTakeaways: takeaways,
      suggestedTags: ['#saved'],
    };
  };

  if (!genAiClient) {
    return buildFallbackSynthesis();
  }

  const textToAnalyze = (plainContent || cleanExcerpt || params.title).slice(0, 15000);

  try {
    const prompt = `You are an editorial reading assistant for a bookmark manager.
Analyze the following saved link content:

TITLE: ${params.title}
CONTENT:
${textToAnalyze}

Please output a strictly valid JSON object with the following fields:
{
  "summary": "A concise 2-3 sentence summary capturing what this link is about.",
  "keyTakeaways": ["Key point 1", "Key point 2", "Key point 3"],
  "suggestedTags": ["#topic1", "#topic2", "#topic3"]
}
Do not enclose in markdown code fences. Output only valid JSON.`;

    const response = await genAiClient.interactions.create({
      model: 'gemini-3.8-flash',
      input: prompt,
    });

    const outputText = response.output_text?.trim();
    if (!outputText) return buildFallbackSynthesis();

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
    console.error('Gemini synthesis error, using fallback:', error);
    return buildFallbackSynthesis();
  }
}
