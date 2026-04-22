import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoCameraIcon, DocumentDuplicateIcon, PhoneIcon, UserIcon, ArrowRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function CreateCall() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [callId, setCallId] = useState('');
  const [copied, setCopied] = useState(false);

  const generateCallId = () => {
    if (!userName.trim()) {
      toast.error('Please enter your name or phone number first');
      return;
    }

    // Generate a simple 8-character call ID using crypto
    const id = crypto.randomUUID().split('-')[0];
    setCallId(id);
    toast.success('Call link generated!');
  };

  const copyCallLink = () => {
    if (!callId) {
      toast.error('Please generate a call link first');
      return;
    }

    const callLink = `${window.location.origin}/call/${callId}`;
    navigator.clipboard.writeText(callLink);
    setCopied(true);
    toast.success('Call link copied! Share it with the other person.');
    
    setTimeout(() => setCopied(false), 3000);
  };

  const startCall = () => {
    if (!userName.trim()) {
      toast.error('Please enter your name or phone number');
      return;
    }

    if (!callId) {
      toast.error('Please generate a call link first');
      return;
    }

    // Save user info to sessionStorage for the call
    sessionStorage.setItem('guestName', userName);
    navigate(`/call/${callId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <VideoCameraIcon className="h-5 w-5 text-purple-600" />
            </button>
            <h1 className="text-base font-bold text-gray-900">Create One-on-One Call</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-card p-8 md:p-12">
          {/* Header Section */}
          <div className="text-center mb-10">
            <div className="inline-flex p-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg mb-4">
              <PhoneIcon className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Start Your Call
            </h2>
            <p className="text-gray-600 text-sm">
              Connect with anyone, anywhere - from Gujarat to West Bengal or across the world!
            </p>
          </div>

          {/* Step 1: Enter Name */}
          <div className="mb-8">
            <label className="flex items-center text-sm font-semibold text-gray-700 mb-3">
              <span className="flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full mr-3 text-sm">
                1
              </span>
              Enter Your Name or Phone Number
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g., Kishan or +91 98765 43210"
                className="w-full pl-10 pr-3 py-3 text-sm border border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && userName.trim() && !callId) {
                    generateCallId();
                  }
                }}
              />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              This will be displayed to the other person during the call
            </p>
          </div>

          {/* Step 2: Generate Call Link */}
          <div className="mb-8">
            <label className="flex items-center text-sm font-semibold text-gray-700 mb-3">
              <span className="flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full mr-3 text-sm">
                2
              </span>
              Generate Call Link
            </label>
            <button
              onClick={generateCallId}
              disabled={!userName.trim()}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center space-x-2 ${
                !userName.trim()
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : callId
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg'
              }`}
            >
              {callId ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  <span>Call Link Generated!</span>
                </>
              ) : (
                <>
                  <VideoCameraIcon className="h-4 w-4" />
                  <span>Generate Call Link</span>
                </>
              )}
            </button>
          </div>

          {/* Step 3: Share or Start */}
          {callId && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
              {/* Call Link Display */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Your Call Link
                </label>
                <div className="flex items-center space-x-3">
                  <div className="flex-1 bg-white px-4 py-3 rounded-lg border border-gray-200 font-mono text-sm break-all">
                    {`${window.location.origin}/call/${callId}`}
                  </div>
                  <button
                    onClick={copyCallLink}
                    className={`p-2.5 rounded-lg transition-all duration-300 ${
                      copied
                        ? 'bg-green-500 text-white'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                    title="Copy link"
                  >
                    {copied ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  Share this link with the person you want to call
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={copyCallLink}
                  className="py-3 px-4 bg-white border border-purple-600 text-purple-600 rounded-lg font-semibold text-sm hover:bg-purple-50 transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                  <span>Copy Link to Share</span>
                </button>
                <button
                  onClick={startCall}
                  className="py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold text-sm hover:shadow-lg transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  <span>Start Call Now</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="mt-10 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center text-sm">
              <PhoneIcon className="h-4 w-4 mr-2" />
              How it works
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start">
                <span className="flex items-center justify-center w-6 h-6 bg-blue-200 rounded-full mr-3 mt-0.5 flex-shrink-0 font-semibold">
                  1
                </span>
                <span>Enter your name or phone number so the other person knows who's calling</span>
              </li>
              <li className="flex items-start">
                <span className="flex items-center justify-center w-6 h-6 bg-blue-200 rounded-full mr-3 mt-0.5 flex-shrink-0 font-semibold">
                  2
                </span>
                <span>Generate a unique call link that's ready to share</span>
              </li>
              <li className="flex items-start">
                <span className="flex items-center justify-center w-6 h-6 bg-blue-200 rounded-full mr-3 mt-0.5 flex-shrink-0 font-semibold">
                  3
                </span>
                <span>Share the link via WhatsApp, SMS, email, or any messaging app</span>
              </li>
              <li className="flex items-start">
                <span className="flex items-center justify-center w-6 h-6 bg-blue-200 rounded-full mr-3 mt-0.5 flex-shrink-0 font-semibold">
                  4
                </span>
                <span>Both of you can join the call from anywhere - works across cities and even different browsers!</span>
              </li>
            </ul>
          </div>

          {/* Testing Info */}
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h3 className="font-semibold text-amber-900 mb-2 flex items-center text-sm">
              <VideoCameraIcon className="h-4 w-4 mr-2" />
              Testing Tip
            </h3>
            <p className="text-xs text-amber-800">
              Want to test it yourself? Copy the call link and open it in a different browser window or incognito mode. 
              You'll be able to see yourself and test the video/audio features!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
