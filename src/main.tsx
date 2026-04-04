import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import App from './App.tsx'
import './index.css'
import { ReactQueryProvider } from './providers/ReactQueryProvider'

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ReactQueryProvider>
        <App />
      </ReactQueryProvider>
    </BrowserRouter>
  </StrictMode>
);
