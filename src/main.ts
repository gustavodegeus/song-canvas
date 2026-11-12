import '@fontsource/allura/latin-400.css';
import '@fontsource/allura/latin-ext-400.css';
import './style.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(createElement(App));
