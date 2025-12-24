import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement!);
root.render(
  <React.StrictMode>
    <BrowserRouter basename="/Smart_Parking_Project/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
