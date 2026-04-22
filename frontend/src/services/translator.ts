/**
 * Translation Service
 * Uses MyMemory Translation API (free, no API key required)
 */

export async function translateText(text: string, sourceLang: string = 'en', targetLang: string = 'bn'): Promise<string> {
  if (!text.trim()) {
    return text;
  }

  try {
    const encodedText = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    } else {
      throw new Error('Translation failed');
    }
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

/**
 * Translate English to Bengali
 */
export async function translateEnglishToBengali(text: string): Promise<string> {
  return translateText(text, 'en', 'bn');
}

/**
 * Translate Bengali to English
 */
export async function translateBengaliToEnglish(text: string): Promise<string> {
  return translateText(text, 'bn', 'en');
}
