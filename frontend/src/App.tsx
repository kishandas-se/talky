import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import Home from './pages/Home.tsx';
import GlobalDirectCallHandler from './components/GlobalDirectCallHandler.tsx';
import DirectCallOverlay from './components/DirectCallOverlay.tsx';
import OfflineIndicator from './components/OfflineIndicator.tsx';

// Lazy load heavy components
const CallRoom = lazy(() => import('./pages/CallRoom.tsx'));
const MeetingRoom = lazy(() => import('./pages/MeetingRoom.tsx'));
const Chat = lazy(() => import('./pages/Chat.tsx'));

// Loading component for lazy routes
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="mt-2 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <GlobalDirectCallHandler />
      <DirectCallOverlay />
      <OfflineIndicator />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
            fontSize: '13px',
            padding: '10px 16px',
            maxWidth: '350px',
          },
          success: {
            duration: 2000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/call/:roomId" element={<CallRoom />} />
          <Route path="/meeting" element={<MeetingRoom />} />
          <Route path="/meeting/:roomId" element={<MeetingRoom />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:roomId" element={<Chat />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
