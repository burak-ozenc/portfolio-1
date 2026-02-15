import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Note: StrictMode is disabled to prevent double WebSocket connections in development
// StrictMode intentionally double-mounts components to detect side effects,
// but this causes issues with WebSocket singleton connections
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
