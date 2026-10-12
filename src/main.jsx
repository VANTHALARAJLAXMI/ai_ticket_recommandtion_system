import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './hooks/useAuth.js';
import { ToastProvider } from './components/Toast.jsx';
import './styles/global.css';
import './styles/layout.css';
import './styles/landing.css';
import './styles/dashboard.css';
import './styles/tickets.css';
import './styles/forms.css';
import './styles/auth.css';
import './styles/responsive.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
