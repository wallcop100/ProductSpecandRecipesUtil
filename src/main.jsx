import React from 'react'
import ReactDOM from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'material-icons/iconfont/filled.css'
import './debug.css'
import App from './App'
import { installPlatform } from './platform/api'
import { startConfigSync } from './platform/projectConfig'
import { startLearning } from './platform/learning'
import useStore from './store/useStore'

// Supply `window.electronAPI` before anything renders — the rest of src/ is
// written against that surface and neither knows nor cares that it is a browser.
installPlatform()
// Beside a companion, the open project's configuration follows every save (silent).
startConfigSync(() => useStore.getState())
// …and every ElementType decision is learned as it is made (silent; see platform/learning.js).
startLearning()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
