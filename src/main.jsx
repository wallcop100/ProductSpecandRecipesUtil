import React from 'react'
import ReactDOM from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'material-icons/iconfont/filled.css'
import './debug.css'
import App from './App'
import { installPlatform } from './platform/api'

// Supply `window.electronAPI` before anything renders — the rest of src/ is
// written against that surface and neither knows nor cares that it is a browser.
installPlatform()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
