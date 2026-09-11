import React from 'react';
import ReactDOM from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { RbrwxBroadcastWorkspace } from './broadcast-host/RbrwxBroadcastWorkspace';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RbrwxBroadcastWorkspace />
  </React.StrictMode>,
);
