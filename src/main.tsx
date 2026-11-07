import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Hud from './Hud';
import '@mantine/core/styles.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get('view') === 'hud' ? <Hud /> : <App />}
  </React.StrictMode>,
);
