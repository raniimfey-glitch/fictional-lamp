/**
 * ================================================================
 *  TTS Manager — رنيم فاي | التعلم الممتع
 *  File     : tts.js
 *  Developer: Samira Abdessadok "رنيم فاي"
 *  © 2026 All Rights Reserved
 * ================================================================
 *
 *  مدير نطق النصوص (Text-to-Speech) للمنصة
 *  يستخدم ElevenLabs عبر Vercel Proxy الآمن
 *  مع احتياطي تلقائي على Web Speech API
 * ================================================================
 */

(function() {
  'use strict';

  // ── إعدادات ──
  var TTS_PROXY_URL = '/api/tts';   // Vercel serverless function
  var HOVER_DELAY   = 600;          // ms قبل النطق عند التحويم
  var CACHE_MAX     = 50;           // أقصى عدد أصوات مخزنة مؤقتاً

  // ── حالة النظام ──
  var _cache    = {};               // { text: AudioBuffer }
  var _cacheKeys = [];              // ترتيب المفاتيح للـ LRU
  var _currentAudio = null;         // الصوت الجاري تشغيله
  var _hoverTimer   = null;         // مؤقت التحويم
  var _audioCtx     = null;         // Web Audio Context
  var _enabled      = true;         // هل TTS مفعّل؟
  var _usingFallback = false;       // هل نستخدم Web Speech؟

  // ── تهيئة Audio Context ──
  function getAudioCtx() {
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.warn('[TTS] AudioContext not supported');
        _usingFallback = true;
      }
    }
    return _audioCtx;
  }

  // ── فتح Audio Context بعد تفاعل المستخدم (Android) ──
  function unlockAudio() {
    var ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('click',      unlockAudio, { once: true, passive: true });

  // ── كاش LRU ──
  function cacheGet(key) {
    return _cache[key] || null;
  }

  function cacheSet(key, buffer) {
    if (_cacheKeys.length >= CACHE_MAX) {
      var oldest = _cacheKeys.shift();
      delete _cache[oldest];
    }
    _cache[key] = buffer;
    _cacheKeys.push(key);
  }

  // ── إيقاف الصوت الحالي ──
  function stopCurrent() {
    if (_currentAudio) {
      try { _currentAudio.stop(); } catch(e) {}
      _currentAudio = null;
    }
    // إيقاف Web Speech أيضاً
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  // ── تشغيل buffer صوتي ──
  function playBuffer(buffer) {
    var ctx = getAudioCtx();
    if (!ctx) return;
    stopCurrent();
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      _currentAudio = source;
    } catch(e) {
      console.warn('[TTS] playBuffer error:', e);
    }
  }

  // ── Fallback: Web Speech API ──
  function speakFallback(text) {
    if (!window.speechSynthesis) return;
    stopCurrent();
    var utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'ar-DZ';
    utt.rate = 0.9;
    utt.pitch = 1.1;
    // اختيار صوت عربي إن وُجد
    var voices = window.speechSynthesis.getVoices();
    var arVoice = voices.find(function(v) {
      return v.lang.startsWith('ar') || v.name.includes('Arabic');
    });
    if (arVoice) utt.voice = arVoice;
    window.speechSynthesis.speak(utt);
  }

  // ── الطلب الرئيسي من ElevenLabs عبر Proxy ──
  function fetchAndPlay(text) {
    if (!_enabled) return;

    // تحقق من الكاش أولاً
    var cached = cacheGet(text);
    if (cached) {
      playBuffer(cached);
      return;
    }

    // طلب من Vercel Proxy
    var url = TTS_PROXY_URL + '?text=' + encodeURIComponent(text) + '&voice=sarah';

    fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function(arrayBuf) {
        var ctx = getAudioCtx();
        if (!ctx) {
          _usingFallback = true;
          speakFallback(text);
          return;
        }
        return ctx.decodeAudioData(arrayBuf);
      })
      .then(function(audioBuffer) {
        if (!audioBuffer) return;
        cacheSet(text, audioBuffer);
        playBuffer(audioBuffer);
      })
      .catch(function(err) {
        console.warn('[TTS] ElevenLabs failed, using fallback:', err.message);
        _usingFallback = true;
        speakFallback(text);
      });
  }

  // ── النطق بتأخير (hover) ──
  function speakWithDelay(text, delay) {
    clearTimeout(_hoverTimer);
    _hoverTimer = setTimeout(function() {
      fetchAndPlay(text);
    }, delay || HOVER_DELAY);
  }

  // ── إلغاء النطق المؤجل ──
  function cancelDelay() {
    clearTimeout(_hoverTimer);
  }

  // ── ربط البطاقات بأحداث التحويم ──
  function attachToCards() {
    var grid = document.getElementById('appGrid');
    if (!grid) return;

    // MutationObserver لمراقبة إضافة بطاقات جديدة
    var observer = new MutationObserver(function() {
      bindCards();
    });
    observer.observe(grid, { childList: true });

    bindCards();
  }

  function bindCards() {
    var cards = document.querySelectorAll('.card[data-index]');
    cards.forEach(function(card) {
      // تجنب الربط المكرر
      if (card._ttsAttached) return;
      card._ttsAttached = true;

      var titleEl = card.querySelector('.card-title');
      if (!titleEl) return;
      var text = titleEl.textContent.trim();
      if (!text) return;

      // تحويم بالماوس (Desktop)
      card.addEventListener('mouseenter', function() {
        speakWithDelay(text, HOVER_DELAY);
      });
      card.addEventListener('mouseleave', function() {
        cancelDelay();
        stopCurrent();
      });

      // لمس طويل (Mobile)
      var touchTimer = null;
      card.addEventListener('touchstart', function() {
        touchTimer = setTimeout(function() {
          fetchAndPlay(text);
        }, 800);
      }, { passive: true });
      card.addEventListener('touchend', function() {
        clearTimeout(touchTimer);
      }, { passive: true });
    });
  }

  // ── واجهة برمجية عامة ──
  window.RanimTTS = {
    // نطق نص مباشرةً
    speak: function(text) {
      fetchAndPlay(text);
    },

    // نطق مع تأخير
    speakDelayed: function(text, delay) {
      speakWithDelay(text, delay);
    },

    // إيقاف الصوت
    stop: function() {
      cancelDelay();
      stopCurrent();
    },

    // تفعيل / تعطيل
    enable: function()  { _enabled = true;  },
    disable: function() { _enabled = false; stopCurrent(); },
    toggle: function()  { _enabled = !_enabled; if (!_enabled) stopCurrent(); return _enabled; },
    isEnabled: function() { return _enabled; },

    // مسح الكاش
    clearCache: function() {
      _cache = {};
      _cacheKeys = [];
    },

    // إعادة ربط البطاقات (بعد renderGrid)
    rebind: function() {
      bindCards();
    },

    // معلومات
    info: function() {
      return {
        enabled:      _enabled,
        usingFallback: _usingFallback,
        cacheSize:    _cacheKeys.length,
        audioCtx:     _audioCtx ? _audioCtx.state : 'none',
      };
    }
  };

  // ── تهيئة تلقائية عند جاهزية DOM ──
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(attachToCards, 500);
      });
    } else {
      setTimeout(attachToCards, 500);
    }
  }

  init();

  console.log('[TTS] رنيم فاي TTS Manager loaded ✅');

})();
