import { useState, useEffect } from 'react';
import { UserIcon } from '@heroicons/react/24/outline';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';

interface NameEntryModalProps {
  onSubmit: (name: string) => void;
  suggestedName?: string;
}

export default function NameEntryModal({ onSubmit, suggestedName }: NameEntryModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { language } = useLanguageStore();
  const t = translations[language];

  // Pre-fill suggested name on mount
  useEffect(() => {
    if (suggestedName && !name) {
      setName(suggestedName);
    }
  }, [suggestedName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (trimmedName.length > 30) {
      setError('Name must be less than 30 characters');
      return;
    }

    onSubmit(trimmedName);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
            <UserIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.welcomeToTalky}</h2>
          <p className="text-sm text-gray-600 text-center">
            {suggestedName ? t.welcomeBack : t.enterYourName}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {suggestedName && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  {language === 'en' ? 'Continue as' : 'হিসাবে চালিয়ে যান'} <strong>{suggestedName}</strong> {language === 'en' ? 'or enter a different name below' : 'অথবা নীচে একটি ভিন্ন নাম লিখুন'}
                </p>
              </div>
            </div>
          )}
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              {t.yourName}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder={t.namePlaceholder}
              className={`w-full px-4 py-3 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
              maxLength={30}
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            <p className="text-xs text-gray-500 mt-1.5">
              {t.nameVisibleToOthers}
            </p>
          </div>

          <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs text-purple-900 font-medium mb-1">
                  {suggestedName ? (language === 'en' ? 'Name saved for quick access' : 'দ্রুত অ্যাক্সেসের জন্য নাম সংরক্ষিত') : t.yourNameWillBeSaved}
                </p>
                <p className="text-xs text-purple-700">
                  {suggestedName 
                    ? (language === 'en' ? 'You can change it anytime or use a different name in new tabs' : 'আপনি যেকোনো সময় এটি পরিবর্তন করতে পারেন বা নতুন ট্যাবে একটি ভিন্ন নাম ব্যবহার করতে পারেন')
                    : t.wontBeAskedAgain
                  }
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {t.getStarted}
          </button>
        </form>

        <p className="text-xs text-center text-gray-500 mt-4">
          By continuing, you agree to use your real name or a recognizable nickname
        </p>
      </div>
    </div>
  );
}
