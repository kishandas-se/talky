import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, UserIcon } from '@heroicons/react/24/outline';
import { OnlineUser } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';

interface UserDropdownProps {
  users: OnlineUser[];
  selectedUser: OnlineUser | null;
  onSelect: (user: OnlineUser) => void;
  disabled?: boolean;
}

export default function UserDropdown({ users, selectedUser, onSelect, disabled }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguageStore();
  const t = translations[language];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (user: OnlineUser) => {
    onSelect(user);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg text-left flex items-center justify-between transition-all ${
          disabled
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-white border-gray-300 hover:border-purple-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedUser ? (
            <>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                {selectedUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{selectedUser.username}</p>
                <p className="text-xs text-gray-500">ID: {selectedUser.userId}</p>
              </div>
            </>
          ) : (
            <>
              <UserIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500">
                {disabled ? t.noUsersOnline : t.selectUser}
              </span>
            </>
          )}
        </div>
        <ChevronDownIcon
          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && users.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {users.map((user) => (
            <button
              key={user.userId}
              type="button"
              onClick={() => handleSelect(user)}
              className={`w-full px-3 py-2.5 text-left hover:bg-purple-50 transition-colors flex items-center gap-2 border-b border-gray-100 last:border-b-0 ${
                selectedUser?.userId === user.userId ? 'bg-purple-50' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{user.username}</p>
                <p className="text-xs text-gray-500">ID: {user.userId}</p>
              </div>
              <div className="flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && users.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-center">
          <p className="text-sm text-gray-500">{t.noUsersAvailable}</p>
          <p className="text-xs text-gray-400 mt-1">{t.openAnotherTab}</p>
        </div>
      )}
    </div>
  );
}
