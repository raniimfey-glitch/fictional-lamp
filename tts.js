/**
 * ================================================================
 *  Vercel Serverless Function — ElevenLabs TTS Proxy
 *  File     : api/tts.js
 *  Project  : التعلم الممتع | Fun Learning — رنيم فاي
 *  Developer: Samira Abdessadok "رنيم فاي"
 *  © 2026 All Rights Reserved
 * ================================================================
 *
 *  يعمل كـ proxy آمن بين المنصة و ElevenLabs API
 *  المفتاح محفوظ في متغيرات Vercel البيئية (ELEVENLABS_API_KEY)
 *  ولا يظهر أبداً في كود المنصة
 * ================================================================
 */

export const config = {
  runtime: 'edge', // أسرع استجابة
};

// Voice IDs من ElevenLabs
const VOICES = {
  sarah:    'EXAVITQu4vr4xnSDxMaL', // Sarah — أنثى متعدد اللغات (عربي ✅)
  aria:     '9BWtsMINqrJLrRacOk9x', // Aria — احتياطي
  callum:   'N2lVS1w4EtoT3dr4eOWO', // Callum — ذكر
};

const DEFAULT_VOICE = VOICES.sarah;
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'; // يدعم العربية

export default async function handler(req) {
  // السماح فقط لـ GET و POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // قراءة النص المطلوب
    let text = '';
    let voiceId = DEFAULT_VOICE;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      text    = url.searchParams.get('text') || '';
      const v = url.searchParams.get('voice');
      if (v && VOICES[v]) voiceId = VOICES[v];
    } else {
      const body = await req.json().catch(() => ({}));
      text    = body.text    || '';
      const v = body.voice;
      if (v && VOICES[v]) voiceId = VOICES[v];
    }

    // تحقق من النص
    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'النص مطلوب' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // حد أقصى 300 حرف
    text = text.trim().substring(0, 300);

    // مفتاح API من متغيرات Vercel
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // طلب ElevenLabs API
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability:        0.5,
            similarity_boost: 0.8,
            style:            0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error('[TTS] ElevenLabs error:', elevenRes.status, errText);
      return new Response(
        JSON.stringify({ error: 'TTS service error', status: elevenRes.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // إرجاع الصوت مباشرةً
    return new Response(elevenRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400', // كاش يوم كامل
        'X-Voice-Id': voiceId,
      },
    });

  } catch (err) {
    console.error('[TTS] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
