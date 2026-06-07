import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  // Поглинаємо нешкідливі помилки підключення розробницького веб-сокета Vite
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason);
    if (
      reason.includes('WebSocket') || 
      reason.includes('vite') || 
      reason.includes('ws://') || 
      reason.includes('wss://')
    ) {
      event.preventDefault();
    }
  });

  const originalError = console.error;
  console.error = (...args) => {
    const msg = args.join(' ');
    if (
      msg.includes('[vite] failed to connect to websocket') ||
      msg.includes('WebSocket connection') ||
      msg.includes('WebSocket') ||
      msg.includes('ws://') ||
      msg.includes('wss://')
    ) {
       return;
    }
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

