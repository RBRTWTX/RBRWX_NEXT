import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './Demo.js';
import '../styles/broadcast-graphics.css';
import '../styles/graphics-menu.css';
import './demo.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
